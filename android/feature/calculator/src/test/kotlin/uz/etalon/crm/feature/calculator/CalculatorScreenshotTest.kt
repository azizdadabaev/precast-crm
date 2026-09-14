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
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.click
import androidx.compose.ui.test.filterToOne
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
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
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.height
import androidx.compose.ui.unit.width
import com.github.takahirom.roborazzi.captureRoboImage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flowOf
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.calc.CalculatorDraft
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
 * How many characters of this text are actually on screen, taken off the layout Compose performed
 * rather than guessed from the node's width. A single-line run that had to ellipsise ends before
 * its own last character, which is what «the figure is cut off» means.
 *
 * `internal` because `SummarySheetScreenshotTest` asks the same question of the same hero at 130 %.
 *
 * `hasVisualOverflow` would be the obvious flag and is the wrong one: it compares the node's
 * rounded size against the paragraph's fractional width and reports true for text that fits
 * perfectly well (137 px of figure inside 308 px of sheet).
 */
internal fun SemanticsNodeInteraction.visibleCharacters(): Int {
    val layouts = mutableListOf<TextLayoutResult>()
    fetchSemanticsNode().config[SemanticsActions.GetTextLayoutResult].action?.invoke(layouts)
    return layouts.first().getLineEnd(0, visibleEnd = true)
}

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
    private fun viewModel(
        canWrite: Boolean = true,
        observeDraft: ObserveDraftUseCase = ObserveDraftUseCase { flowOf(null) },
    ) = CalculatorViewModel(
        session = InertSessionPricing(),
        permissions = PermissionGate { canWrite },
        clients = ClientsRepository(
            api = object : FakeEtalonApi() {
                override suspend fun clients(q: String?, phone: String?, page: Int, pageSize: Int, sortBy: String?, sortDir: String?) =
                    ClientsPageDto(rows = emptyList(), total = 0, page = 1, pageSize = 50, pageCount = 1)
            },
            permissions = PermissionGate { canWrite },
        ),
        observeDraft = observeDraft,
    )

    /** The whole screen, driven by a real [CalculatorViewModel] — the only way the §8 rule («the
     *  fixtures are typed through the UI and read back off it») can be an acceptance test rather
     *  than a picture of a hand-built state. */
    private fun screen(vm: CalculatorViewModel, onBack: (() -> Unit)? = {}, imeVisible: Boolean = false) {
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
                        onPickRate = vm::pickRate,
                        onConfirmRate = vm::confirmRate,
                        onDismissRateConfirm = vm::dismissRateConfirm,
                        onToggleClientForm = vm::toggleClientForm,
                        onDismissToast = vm::dismissToast,
                        clientForm = { ClientForm(state = s, vm = vm) },
                        summarySheet = { SummarySheet(state = s, vm = vm, barVisible = !imeVisible) },
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
            rateConfirmPrice = null, onPickRate = {}, onConfirmRate = { true }, onDismissRateConfirm = {},
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
     *
     * **This frame draws a back circle the app never draws.** The calculator is a bottom-bar tab,
     * so `CalculatorRoute` passes `onBack = null` and the real header renders the title block
     * alone; the recording passes a non-null `onBack` on purpose, so the frame can be held beside
     * `3a-calculator.png` element for element. What the app actually does is pinned by
     * [theBackCircleIsNotDrawnWithNowhereToGoBackTo], not by this picture.
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

    /**
     * I2 · the same hero on the narrowest phone the app targets. §3.4 draws «Жами» + the figure
     * beside the material line, and at 360 dp — a 308 dp inner width — that leaves the 26 sp figure
     * less than it needs: «13 542 460» came out ellipsised and «UZS», measured after it into what
     * was left, was not drawn at all. Under `HERO_STACK_BELOW` the sheet stacks the caption and the
     * material line above the figure, which then has the whole width (the arrangement the
     * customer's PNG has always used at its fixed 360 dp).
     *
     * Both runs are asserted from their own text layout rather than by eye — an ellipsis and a
     * missing three-letter unit are exactly what a reviewer's glance at a 360 dp frame misses.
     */
    @Test @Config(qualifiers = "w360dp-h800dp")
    fun calculatorW360Light() {
        val vm = viewModel()
        screen(vm)
        typeTheFixtures(vm)
        rule.onNode(hasScrollAction()).performScrollToIndex(0)
        rule.waitForIdle()
        assertTheWholeHeroIsDrawn()
        rule.onRoot().captureRoboImage("screenshots/calculator_w360_light.png")
    }

    /** [FIXTURE_TOTAL] and «UZS», both whole: neither run was cut short, and the unit was measured
     *  into a box at all. The same phone at 130 % is `SummarySheetScreenshotTest.heroW360Font13` —
     *  this screen's own helpers cannot type the fixtures at that combination (a cell's text gains
     *  a scroll action of its own there, and `fillLastRoom` can no longer tell the list from it). */
    private fun assertTheWholeHeroIsDrawn() {
        // The SHEET's hero, not the off-screen share card's copy of the same figure: only the sheet
        // publishes «13 542 460 UZS» as one description, with R7's unit after the number.
        val hero = hasAnyAncestor(hasContentDescription("$FIXTURE_TOTAL $MONEY_UNIT"))
        val figure = rule.onAllNodesWithText(FIXTURE_TOTAL, useUnmergedTree = true).filterToOne(hero)
        val unit = rule.onAllNodesWithText(MONEY_UNIT, useUnmergedTree = true).filterToOne(hero)
        assertEquals("«$FIXTURE_TOTAL» is cut short in the summary sheet", FIXTURE_TOTAL.length, figure.visibleCharacters())
        assertEquals("«$MONEY_UNIT» is cut short in the summary sheet", MONEY_UNIT.length, unit.visibleCharacters())
        // The unit used to be measured into nothing at all — laid out after the figure, in what was
        // left of a row that had already run out.
        assertTrue(
            "«$MONEY_UNIT» measured ${unit.getUnclippedBoundsInRoot().width}",
            unit.getUnclippedBoundsInRoot().width > 0.dp,
        )
    }

    /** A new quote with the client card opened by its chevron: no client yet, so the form shows
     *  under the row (collapsed by default since 2026-09-14), and one blank card is already there
     *  to type into (R8). */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun calculatorClientFormLight() {
        screen(viewModel().also { it.toggleClientForm() })
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

    /**
     * The fixed summary sheet steps aside for the keyboard, and comes back when it closes.
     *
     * The IME cannot be raised under Robolectric — `WindowInsets.isImeVisible` reports absent
     * whatever is focused — so the screen is driven through [SummarySheet]'s own `barVisible`,
     * which is what that inset feeds in the app. The measurement is the thing that matters: the
     * tagged box is what `calculatorFont13` proves the last card clears, and while the keyboard
     * is up it must measure nothing at all rather than sit behind the keys covering the room
     * being typed into.
     */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun theSummarySheetIsNotDrawnWhileTheKeyboardIsUp() {
        val vm = viewModel()
        screen(vm, imeVisible = true)
        rule.onNodeWithContentDescription("$FIXTURE_TOTAL $MONEY_UNIT").assertDoesNotExist()
        assertEquals(0.dp, rule.onNodeWithTag(SUMMARY_SHEET_TAG).getUnclippedBoundsInRoot().height)
    }

    /** And the same screen with the keyboard down: the sheet is back, at a real height. */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun theSummarySheetReturnsWhenTheKeyboardCloses() {
        val vm = viewModel()
        screen(vm)
        assertTrue(rule.onNodeWithTag(SUMMARY_SHEET_TAG).getUnclippedBoundsInRoot().height > 0.dp)
    }

    /**
     * R8's other half. The screen adds a blank card when the quote is empty — but only once
     * `restored` says Room has been asked. A draft that restores ONE room must therefore open with
     * exactly one card, carrying that room's name, and no blank card beside it: asked on the first
     * composition instead, the operator would find their restored quote with a stray empty room in
     * it (and the autosave would then persist that room).
     */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun aRestoredDraftOpensWithItsOwnRoomAndNoBlankOneBesideIt() {
        val draft = CalculatorDraft(
            rows = listOf(recomputeRow(SlabRow(id = "r1", name = "Долон", innerWidth = 4.0, innerLength = 6.0))),
            clientPhone = "998935554466", clientName = CLIENT_NAME, clientAddress = "",
            discountPercent = 0.0, discountAmount = 0.0, deliveryCost = 0.0, otherCost = 0.0,
            projectId = null,
        )
        val vm = viewModel(observeDraft = ObserveDraftUseCase { flowOf(draft) })
        screen(vm)

        assertEquals(listOf("Долон"), vm.state.value.rows.map { it.name })
        // The EDITABLE «Долон» — one card's name field, and exactly one. (The same name also
        // reaches the off-screen `QuoteCard` the share action keeps composed, as plain text.)
        rule.onNode(hasSetTextAction() and hasText("Долон")).assertExists()
        // «Хона 1» is what `addRoom` would have named the stray card.
        rule.onAllNodesWithText("Хона 1").assertCountEquals(0)
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
                        rateConfirmPrice = null, onPickRate = {}, onConfirmRate = { true }, onDismissRateConfirm = {},
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
                        rateConfirmPrice = null, onPickRate = {}, onConfirmRate = { true }, onDismissRateConfirm = {},
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

