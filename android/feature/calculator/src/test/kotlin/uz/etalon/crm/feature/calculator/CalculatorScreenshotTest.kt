package uz.etalon.crm.feature.calculator

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.click
import androidx.compose.ui.test.filterToOne
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeUp
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.height
import com.github.takahirom.roborazzi.captureRoboImage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.calc.Pattern
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.money
import uz.etalon.crm.core.calc.recomputeRow
import uz.etalon.crm.core.data.ClientsRepository
import uz.etalon.crm.core.data.PermissionGate
import uz.etalon.crm.core.data.SessionPricing
import uz.etalon.crm.core.designsystem.components.LocalNavPillInset
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.Pricing
import uz.etalon.crm.core.network.dto.ClientsPageDto
import uz.etalon.crm.core.testing.FakeEtalonApi
import uz.etalon.crm.core.ui.format.MONEY_UNIT
import uz.etalon.crm.core.ui.format.formatMoney

/** What `SignedInShell` provides into [LocalNavPillInset] at Robolectric's 0 dp system navigation
 *  inset: the pill's 84 dp band alone, so these frames carry the clearance a real phone shows. */
private val SHELL_NAV_PILL_INSET = 84.dp

/** The card frames are shot at the width the screen gives a card: the 411 dp phone less
 *  `CalculatorScreen`'s own 16 dp margin on each side, on the page ground the screen draws them
 *  on — so a reviewer can hold `3a-calculator.png` beside them at the same scale. */
private val PHONE_WIDTH = 411.dp
/** The narrowest phone the app targets — where the ⋯ row's three columns are tightest. */
private val NARROW_PHONE = 360.dp
private val CARD_MARGIN = 16.dp
/** §3.4: «gap 10 between cards». */
private val CARD_GAP = 10.dp

// The ⋯ row's own strings, as `strings.xml` writes them — these three tests drive the panel
// rather than photographing it, so they find their nodes the way TalkBack does.
private const val DECREASE = "Қўшимча балкани камайтириш"
private const val INCREASE = "Қўшимча балка қўшиш"
private const val START_BEAM = "Бош балка"

/** §3.4 «AddRoomButton», as the screen draws it — the last item of the list, so scrolling to it
 *  is scrolling to the end. */
private const val ADD_ROOM = "+ Янги хона"
private const val BACK = "Орқага"

/** Enough half-viewport swipes to reach the end of a three-room list at any font scale — past the
 *  end they do nothing, so the count only has to be generous. */
private const val SWIPES_TO_THE_END = 6

/**
 * The three §7 fixtures the whole calculator is accepted against, as the operator types them —
 * «Эни», «Бўйи», and the subtotal the footer must then show. The separators in the sums are
 * U+202F NARROW NO-BREAK SPACE, D8's group separator (see `Formatters.kt`) — not the plain spaces
 * they look like.
 */
private val FIXTURES = listOf(
    Triple("Зал", "5,2" to "7,1", "7 330 400"),
    Triple("Хона 1", "4,0" to "6,0", "3 749 600"),
    Triple("Ошхона", "3,6" to "4,5", "2 462 460"),
)

/** Σ of the three above — the figure the fixed summary sheet reads out (§8). */
private const val FIXTURE_TOTAL = "13 542 460"

/** The capture's own customer: «Karimov LLC · +998 93 555 44 66 · Самарқанд, Регистон». */
private const val CLIENT_NAME = "Karimov LLC"
private const val CLIENT_PHONE = "935554466"
private const val CLIENT_VILOYAT = "Самарқанд"
private const val CLIENT_TUMAN = "Регистон"

/** No pricing is fetched in these frames: every room prices against `DEFAULT_PRICE_CONFIG`, which
 *  is what a real bootstrap `Pricing` reproduces anyway (`BoundaryTest`). */
private class InertSessionPricing : SessionPricing {
    override val pricing: StateFlow<Pricing?> = MutableStateFlow(null)
}

/**
 * The design-3a calculator (`docs/android/restyle-prototype/3a-calculator.png`, spec §3.4): the
 * room card on its own at the width the screen gives it, and the whole screen — header, client
 * row, cards, «+ Янги хона» and the fixed navy summary sheet — with the §7 fixtures typed into it
 * through the UI.
 *
 * Light only (D6).
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class CalculatorScreenshotTest {
    @get:Rule val rule = createComposeRule()

    private fun room(id: String, name: String, width: Double, length: Double) =
        recomputeRow(SlabRow(id = id, name = name, innerWidth = width, innerLength = length))

    /** The capture's own first card: «Зал», 5,2 × 7,1 at the default bearing, priced by the
     *  engine — never by this test (see [zalIsTheCaptureSFixture]). */
    private fun zal(): SlabRow = room("zal", "Зал", 5.2, 7.1)

    /** The cells as the operator typed them, which is what the card renders — «5,2», not the
     *  «5,20» a double formatted back would give (see [RoomDraft]). */
    private fun zalDraft() = RoomDraft(width = "5,2", length = "7,1")

    /** A ViewModel with nothing behind it but the engine: no draft to restore (so the screen's own
     *  R8 rule opens with one blank card), and a clients API that answers every phone lookup with
     *  a clean miss — these fixtures are a new customer, and a THROWING api would surface as a
     *  lookup banner in the middle of the frame. */
    private fun viewModel(canWrite: Boolean = true) = CalculatorViewModel(
        session = InertSessionPricing(),
        permissions = PermissionGate { canWrite },
        clients = ClientsRepository(
            api = object : FakeEtalonApi() {
                override suspend fun clients(q: String?, phone: String?, page: Int, pageSize: Int) =
                    ClientsPageDto(rows = emptyList(), total = 0, page = 1, pageSize = 50, pageCount = 1)
            },
            permissions = PermissionGate { canWrite },
        ),
    )

    /** The whole screen, driven by a real [CalculatorViewModel] — the only way the §8 rule («the
     *  fixtures are typed through the UI and read back off it») can be an acceptance test rather
     *  than a picture of a hand-built state. */
    private fun screen(vm: CalculatorViewModel, onBack: (() -> Unit)? = {}) {
        rule.setContent {
            val s by vm.state.collectAsState()
            EtalonTheme {
                CompositionLocalProvider(LocalNavPillInset provides SHELL_NAV_PILL_INSET) {
                    CalculatorScreen(
                        s = s,
                        onBack = onBack,
                        onAddRoom = vm::addRoom,
                        onDuplicateRoom = vm::duplicateRoom,
                        onDeleteRoom = vm::deleteRoom,
                        onMoveRoomUp = vm::moveRoomUp,
                        onMoveRoomDown = vm::moveRoomDown,
                        onSetName = vm::setName,
                        onToggleExpanded = vm::toggleExpanded,
                        onWidthText = vm::setWidthText,
                        onLengthText = vm::setLengthText,
                        onBearingText = vm::setBearingText,
                        onCorrectionText = vm::setCorrectionText,
                        onCyclePattern = vm::cyclePattern,
                        onExtraBeams = vm::setExtraBeams,
                        onForceStartBeam = vm::setForceStartBeam,
                        onApplyRateOverride = vm::applyRateOverride,
                        onClearRateOverride = vm::clearRateOverride,
                        onToggleClientForm = vm::toggleClientForm,
                        onDismissToast = vm::dismissToast,
                        clientForm = { ClientForm(state = s, vm = vm) },
                        summarySheet = { SummarySheet(state = s, vm = vm) },
                    )
                }
            }
        }
        rule.waitForIdle()
    }

    /** Every editable field on screen, in composition order. Within one card that is
     *  `name, Эни, Бўйи, Таяниш, Корр.` — the five [FIELDS_PER_ROOM] the helpers below index by. */
    private fun fields() = rule.onAllNodes(hasSetTextAction())

    /** Types one fixture into the LAST room on screen — the one «+ Янги хона» just created. */
    private fun fillLastRoom(name: String, width: String, length: String) {
        rule.onNode(hasScrollAction()).performScrollToNode(hasText(ADD_ROOM))
        val last = fields().fetchSemanticsNodes().size - FIELDS_PER_ROOM
        fields()[last].performTextReplacement(name)
        fields()[last + 1].performTextInput(width)
        fields()[last + 2].performTextInput(length)
        rule.waitForIdle()
    }

    private fun addRoom() {
        rule.onNode(hasScrollAction()).performScrollToNode(hasText(ADD_ROOM))
        rule.onNodeWithText(ADD_ROOM).performClick()
        rule.waitForIdle()
    }

    /**
     * The capture's quote, typed the way an operator types it: the card R8 opened with, then two
     * more off «+ Янги хона». Each room's own §7 subtotal is asserted while that card is still on
     * screen — scrolled past, its footer is no longer composed and there would be nothing to read.
     */
    private fun typeTheFixtures(vm: CalculatorViewModel) {
        vm.setClientPhoneDigits(CLIENT_PHONE)
        vm.setClientName(CLIENT_NAME)
        vm.setClientViloyat(CLIENT_VILOYAT)
        vm.setClientTuman(CLIENT_TUMAN)
        rule.waitForIdle()
        FIXTURES.forEachIndexed { index, (name, dims, subtotal) ->
            if (index > 0) addRoom()
            fillLastRoom(name, dims.first, dims.second)
            assertRoomFooterShows(subtotal)
        }
    }

    /**
     * That [sum] is on a room card's own footer — «inside the scrolling list» is what separates it
     * from the two other places the very same figure legitimately appears: the summary sheet (a
     * single-room quote's total IS that room's subtotal) and the off-screen `QuoteCard` the share
     * action keeps composed. `filterToOne` also proves it appears there exactly once.
     */
    private fun assertRoomFooterShows(sum: String) {
        rule.onAllNodesWithText(sum).filterToOne(hasAnyAncestor(hasScrollAction())).assertExists()
    }

    /** One card alone, on the page ground at the width the screen gives it. [width] is the phone,
     *  not the card: the helper insets it by the screen's own 16 dp margin either side. */
    private fun card(row: SlabRow, draft: RoomDraft, expanded: Boolean, width: Dp = PHONE_WIDTH) =
        cards(width) { OneCard(row, draft, expanded) }

    /** The same frame with more than one card in it, `spacedBy(10)` as §3.4 stacks them. */
    private fun cards(width: Dp = PHONE_WIDTH, content: @Composable ColumnScope.() -> Unit) {
        rule.setContent {
            EtalonTheme {
                Column(
                    Modifier.width(width).background(EtalonColors.page).padding(CARD_MARGIN),
                    verticalArrangement = Arrangement.spacedBy(CARD_GAP),
                    content = content,
                )
            }
        }
    }

    @Composable
    private fun OneCard(row: SlabRow, draft: RoomDraft, expanded: Boolean) {
        RoomCard(
            row = row, draft = draft, expanded = expanded,
            canMoveUp = false, canMoveDown = true,
            focusRequester = remember { FocusRequester() }, onNext = null,
            onNameChange = {}, onWidthChange = {}, onLengthChange = {},
            onBearingChange = {}, onCorrectionChange = {},
            onCyclePattern = {}, onToggleExpanded = {},
            onExtraBeams = {}, onForceStartBeam = {},
            onDuplicate = {}, onDelete = {}, onMoveUp = {}, onMoveDown = {},
            onApplyRateOverride = { _, _ -> }, onClearRateOverride = {},
        )
    }

    @Test @Config(qualifiers = "w411dp-h891dp")
    fun roomLight() {
        card(zal(), zalDraft(), expanded = false)
        rule.onRoot().captureRoboImage("screenshots/calculator_room_light.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp")
    fun roomMoreLight() {
        // Re-run the engine: `copy` alone would leave the result strip pricing 0 extra beams while
        // the stepper above it showed 2.
        card(recomputeRow(zal().copy(extraBeams = 2)), zalDraft(), expanded = true)
        rule.onRoot().captureRoboImage("screenshots/calculator_room_more_light.png")
    }

    /** The two manual states in one frame: a rate the operator chose (230k · қўлда) and a pattern
     *  they chose (Г-Б, no «авто» suffix). */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun roomOverrideLight() {
        val row = recomputeRow(
            zal().copy(
                patternOverride = Pattern.GB,
                m2PriceOverride = true, m2PriceOverrideValue = 230_000.0, m2PriceReason = "Йирик буюртма",
            ),
        )
        card(row, zalDraft(), expanded = false)
        rule.onRoot().captureRoboImage("screenshots/calculator_room_override_light.png")
    }

    /** The ⋯ row on the narrowest phone the app supports: the «+Б» cell is one `1fr` column of
     *  `1fr 1fr auto`, 120 dp here against 145 at 411 — the label, the figure and both buttons
     *  have to survive it. */
    @Test @Config(qualifiers = "w360dp-h800dp")
    fun roomMoreW360Light() {
        card(recomputeRow(zal().copy(extraBeams = 2)), zalDraft(), expanded = true, width = NARROW_PHONE)
        rule.onRoot().captureRoboImage("screenshots/calculator_room_more_w360_light.png")
    }

    /** The ⋯ row at 130 %: the «+Б» label may ellipsize away entirely, the figure and the two
     *  buttons may not. */
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f)
    fun roomMoreFont13() {
        card(recomputeRow(zal().copy(extraBeams = 2)), zalDraft(), expanded = true)
        rule.onRoot().captureRoboImage("screenshots/calculator_room_more_font13.png")
    }

    /**
     * The two states the «Зал» frames cannot show: an extras-only room (§4.1 rule 9 — no chip, no
     * м² figures, the beam line alone, and the «cannot be saved» notice) over a room nobody has
     * typed into yet (rule 10 — every figure and the subtotal a dash, no chip).
     */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun roomStatesLight() {
        val extrasOnly = recomputeRow(SlabRow(id = "x", name = "Қўшимча балка", innerWidth = 4.0, extraBeams = 3))
        val empty = SlabRow(id = "e", name = "Хона 2")
        cards {
            OneCard(extrasOnly, RoomDraft(width = "4"), expanded = false)
            OneCard(empty, RoomDraft(), expanded = false)
        }
        rule.onRoot().captureRoboImage("screenshots/calculator_room_states_light.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f)
    fun roomFont13() {
        card(zal(), zalDraft(), expanded = false)
        rule.onRoot().captureRoboImage("screenshots/calculator_room_font13.png")
    }

    /**
     * **The acceptance frame.** `3a-calculator.png` element for element: the header over the
     * collapsed client row, the three fixture rooms, and the fixed navy summary reading
     * [FIXTURE_TOTAL]. Every number on it came out of the engine on the way through the UI —
     * [typeTheFixtures] asserts each room's §7 subtotal as it is typed, and the summary is
     * asserted here.
     */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun calculatorLight() {
        val vm = viewModel()
        screen(vm)
        typeTheFixtures(vm)
        // The sheet's own figure, by the description only IT publishes: R7 puts the unit AFTER the
        // number here, where `MoneyHeroText` (the share card's) puts it before.
        rule.onNodeWithContentDescription("$FIXTURE_TOTAL $MONEY_UNIT").assertExists()
        // Back to the top, which is where the capture stands.
        rule.onNode(hasScrollAction()).performScrollToIndex(0)
        rule.waitForIdle()
        rule.onRoot().captureRoboImage("screenshots/calculator_light.png")
    }

    /** The same screen as it opens for a new quote: no client yet, so the form is expanded under
     *  the row (R9), and one blank card is already there to type into (R8). */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun calculatorClientFormLight() {
        screen(viewModel())
        rule.onNodeWithText("Мижоз танланмаган").assertExists()
        rule.onRoot().captureRoboImage("screenshots/calculator_client_form_light.png")
    }

    /**
     * 130 %, scrolled to the end — the acceptance checklist's own line: «Fixed SummarySheet never
     * covers the last room card (190dp content padding)». Asserted, not only photographed: the
     * list's last item («+ Янги хона», below the last card) must end above the sheet's top edge.
     */
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f)
    fun calculatorFont13() {
        val vm = viewModel()
        screen(vm)
        typeTheFixtures(vm)
        // To the END of the list, not merely far enough for the add button to be somewhere in the
        // viewport: the viewport runs on UNDER the sheet (which is drawn over the list, not laid
        // out beside it), so `performScrollToNode` stops with the button still behind it. Only the
        // list's own 190 dp bottom padding lifts it clear, and only once it can go no further.
        repeat(SWIPES_TO_THE_END) {
            rule.onNode(hasScrollAction()).performTouchInput { swipeUp() }
            rule.waitForIdle()
        }

        val addButton = rule.onNodeWithText(ADD_ROOM).getUnclippedBoundsInRoot()
        val sheet = rule.onNodeWithTag(SUMMARY_SHEET_TAG).getUnclippedBoundsInRoot()
        assertTrue(
            "«$ADD_ROOM» ends at ${addButton.bottom}, the summary sheet starts at ${sheet.top}",
            addButton.bottom <= sheet.top,
        )
        rule.onRoot().captureRoboImage("screenshots/calculator_font13.png")
    }

    /**
     * The keyboard's «next» walk, which no single card can do on its own: Эни hands over to Бўйи
     * inside the card, and Бўйи hands over to the NEXT card's Эни — through the screen, which owns
     * the requesters and scrolls the target into view before asking for the focus.
     */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun nextWalksFromWidthToLengthToTheNextRoom() {
        val vm = viewModel()
        screen(vm)
        // The client form's own three fields would sit before the rooms' in composition order.
        vm.toggleClientForm()
        rule.waitForIdle()
        fillLastRoom("Зал", "5,2", "7,1")
        addRoom()
        fillLastRoom("Хона 2", "4,0", "6,0")
        rule.onNode(hasScrollAction()).performScrollToIndex(0)
        rule.waitForIdle()

        fields()[1].performTextInput("")   // park the focus on room 1's Эни
        fields()[1].performImeAction()
        fields()[2].assertIsFocused()

        fields()[2].performImeAction()
        rule.waitForIdle()
        fields()[FIELDS_PER_ROOM + 1].assertIsFocused()
    }

    /** On the bottom-bar tab there is nothing to pop, so the header draws no back circle at all —
     *  `CalculatorRoute` passes `onBack = null`. */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun theBackCircleIsNotDrawnWithNowhereToGoBackTo() {
        screen(viewModel(), onBack = null)
        rule.onAllNodes(hasText(BACK)).fetchSemanticsNodes().let { assertEquals(0, it.size) }
        rule.onNodeWithContentDescription(BACK).assertDoesNotExist()
    }

    /**
     * The ⋯ row's two stepper slots are 48 dp around 36 dp buttons, so they have to be tiled at
     * the painted boundary rather than centred: centred they overlapped by 12 dp, and Compose
     * hit-tests children in reverse order — so the right sixth of the painted «−» ADDED a beam to
     * the quote. Both halves are asserted: the bounds do not overlap, and a tap just inside the
     * «−»'s right edge decrements.
     */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun stepperSlotsDoNotOverlap() {
        val changes = mutableListOf<Int>()
        rule.setContent {
            EtalonTheme {
                Column(Modifier.width(PHONE_WIDTH).background(EtalonColors.page).padding(CARD_MARGIN)) {
                    RoomCard(
                        row = recomputeRow(zal().copy(extraBeams = 2)), draft = zalDraft(), expanded = true,
                        canMoveUp = false, canMoveDown = true,
                        focusRequester = remember { FocusRequester() }, onNext = null,
                        onNameChange = {}, onWidthChange = {}, onLengthChange = {},
                        onBearingChange = {}, onCorrectionChange = {},
                        onCyclePattern = {}, onToggleExpanded = {},
                        onExtraBeams = { changes += it }, onForceStartBeam = {},
                        onDuplicate = {}, onDelete = {}, onMoveUp = {}, onMoveDown = {},
                        onApplyRateOverride = { _, _ -> }, onClearRateOverride = {},
                    )
                }
            }
        }
        val minus = rule.onNodeWithContentDescription(DECREASE).getUnclippedBoundsInRoot()
        val plus = rule.onNodeWithContentDescription(INCREASE).getUnclippedBoundsInRoot()
        // Measured at 411 dp: «−» [85, 133], «+» [133, 181] — 48 dp each, meeting exactly at the
        // boundary between the two painted 36 dp buttons.
        assertTrue("«−» ends at ${minus.right}, «+» starts at ${plus.left}", minus.right <= plus.left)

        val edge = with(rule.density) {
            Offset((minus.right - 1.dp).toPx(), (minus.top + minus.height / 2).toPx())
        }
        rule.onRoot().performTouchInput { click(edge) }
        assertEquals(listOf(1), changes)
    }

    /** «Бош балка» is a checkbox to a screen reader, not an unlabelled row: the navy fill is the
     *  only thing that says the start beam is forced, and nothing else publishes it. */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun startBeamToggleIsACheckbox() {
        rule.setContent {
            EtalonTheme {
                var row by remember { mutableStateOf(recomputeRow(zal())) }
                Column(Modifier.width(PHONE_WIDTH).background(EtalonColors.page).padding(CARD_MARGIN)) {
                    RoomCard(
                        row = row, draft = zalDraft(), expanded = true,
                        canMoveUp = false, canMoveDown = true,
                        focusRequester = remember { FocusRequester() }, onNext = null,
                        onNameChange = {}, onWidthChange = {}, onLengthChange = {},
                        onBearingChange = {}, onCorrectionChange = {},
                        onCyclePattern = {}, onToggleExpanded = {},
                        onExtraBeams = {}, onForceStartBeam = { row = recomputeRow(row.copy(forceStartBeam = it)) },
                        onDuplicate = {}, onDelete = {}, onMoveUp = {}, onMoveDown = {},
                        onApplyRateOverride = { _, _ -> }, onClearRateOverride = {},
                    )
                }
            }
        }
        rule.onNodeWithText(START_BEAM).assertIsOff()
        rule.onNodeWithText(START_BEAM).performClick()
        rule.onNodeWithText(START_BEAM).assertIsOn()
    }

    /**
     * The card frame is only an acceptance test if the numbers on it are the ENGINE's, not this
     * test's: spec §7's first fixture, asserted here so [roomLight] can never be re-recorded
     * around a card that quietly prices «Зал» differently.
     */
    @Test fun zalIsTheCaptureSFixture() {
        val r = zal().result!!
        assertEquals(7.08, r.monolithLength, 0.0001)
        assertEquals(13, r.beamCount)
        assertEquals(312, r.totalBlocks)
        assertEquals(38.94, r.monolithArea, 0.0001)
        assertEquals(38.28, r.billedArea, 0.0001)
        assertEquals(180_000.0, r.m2Price, 0.0001)
        assertEquals(Money.parse("440000.00"), r.money().patternExtraCost)
        // The separators are U+202F NARROW NO-BREAK SPACE, D8's group separator (see
        // `Formatters.kt`) — spelt as escapes so a diff can tell them from plain spaces.
        assertEquals("7 330 400", formatMoney(r.money().subtotal))
    }
}

/** One room card publishes five editable fields, in this order: the name, Эни, Бўйи, Таяниш and
 *  Корр. — what the helpers above index by. */
private const val FIELDS_PER_ROOM = 5

