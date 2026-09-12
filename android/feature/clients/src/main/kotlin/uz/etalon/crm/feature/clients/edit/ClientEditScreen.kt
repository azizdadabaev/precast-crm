package uz.etalon.crm.feature.clients.edit

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.EtalonTextField
import uz.etalon.crm.core.designsystem.components.FormCard
import uz.etalon.crm.core.designsystem.components.FormField
import uz.etalon.crm.core.designsystem.components.NoticeBanner
import uz.etalon.crm.core.designsystem.components.PHONE_LOCAL_DIGITS
import uz.etalon.crm.core.designsystem.components.PhoneDigitsMask
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.RegionField
import uz.etalon.crm.core.designsystem.components.RegionPickerSheet
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.ClientDetail
import uz.etalon.crm.feature.clients.R

/** Which of the two linked catalogues the sheet is currently browsing, if either. */
private enum class RegionPick { VILOYAT, TUMAN }

/** §2's form sheet: the 20/16 every restyled sheet in the app uses. */
private val SHEET_PAD_H = EtalonSpace.xl
private val SHEET_PAD_V = EtalonSpace.lg

/** How far «Изоҳ» may grow before it scrolls inside itself. */
private const val NOTES_MAX_LINES = 3

/**
 * What the sheet does once the ViewModel reports a save. Lifted out of the `LaunchedEffect` so
 * the ORDER of the two calls is reachable by a test — see ClientEditViewModelTest.
 *
 * `consume` runs FIRST. [onSaved] dismisses the sheet and navigates, which can dispose this
 * composable and cancel the effect mid-way; a clear placed after it could land in that gap and
 * leave `savedId` standing. The ViewModel belongs to the screen's back-stack entry, not to the
 * sheet, so a value left standing outlives the dismissal, and the next open replays the
 * completion against it before `openCreate`'s blanking reaches the collected state — the sheet
 * becomes single-use per screen. That is the Critical this slice already had to fix once, and
 * swapping these two lines back is all it takes to reintroduce it.
 *
 * A dedup hit returns without doing either: nothing was created, so the sheet stays open and
 * says whose number it is. The operator leaves through the explicit action instead.
 */
internal fun completeSave(
    savedId: String?,
    existingClientName: String?,
    consume: () -> Unit,
    onSaved: (String) -> Unit,
) {
    val id = savedId ?: return
    if (existingClientName != null) return
    consume()
    onSaved(id)
}

/**
 * Adding a customer, or correcting one.
 *
 * [client] null means create. On success the sheet reports the id it was given and the host opens
 * that client — never a «қўшилди» toast, because `POST /api/clients` dedups on the normalised
 * phone. When it DID dedup, the sheet stays open, names the client already holding the number and
 * offers to open them, rather than reporting a save that never happened — see [completeSave].
 *
 * The region picker REPLACES this sheet rather than stacking on it, the same way the payment
 * keypad does: a second bottom sheet over an open one is not a shape this app uses, and nothing
 * is lost by the swap because every field lives in the ViewModel.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClientEditSheet(
    client: ClientDetail?,
    isOffline: Boolean,
    onDismiss: () -> Unit,
    onSaved: (String) -> Unit,
    // Declared as the base class so a screenshot test can hand it a plain [ClientEditViewModel]
    // built from lambdas, exactly as `ClientEditViewModelTest` does; the default is still the
    // Hilt one, so nothing about the running app changes.
    vm: ClientEditViewModel = hiltViewModel<HiltClientEditViewModel>(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    var picking by remember { mutableStateOf<RegionPick?>(null) }

    // This ViewModel is scoped to the back-stack entry, not to the sheet, so it outlives a
    // dismissal — the form is blanked and reseeded every time the sheet opens.
    LaunchedEffect(client?.id) { if (client == null) vm.openCreate() else vm.openEdit(client) }
    LaunchedEffect(isOffline) { vm.setOffline(isOffline) }
    LaunchedEffect(s.savedId) {
        completeSave(s.savedId, s.existingClientName, consume = vm::consumeSaved, onSaved = onSaved)
    }

    val pick = picking
    if (pick != null) {
        RegionPickerSheet(
            title = stringResource(if (pick == RegionPick.VILOYAT) R.string.client_field_viloyat else R.string.client_field_tuman),
            options = when (pick) {
                RegionPick.VILOYAT -> VILOYATS.map { it.nameUz to it.name }
                RegionPick.TUMAN -> tumansOf(s.viloyat).map { it.nameUz to it.name }
            },
            onDismiss = { picking = null },
            onPick = { chosen ->
                if (pick == RegionPick.VILOYAT) vm.setViloyat(chosen) else vm.setTuman(chosen)
                picking = null
            },
        )
        return
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        // Straight to full height, the same reason the approve sheet does it: at Material's
        // half-screen anchor the last fields and «Сақлаш» sit below the fold, and a form whose
        // save button has to be dragged into view is a form that gets half filled in.
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = EtalonColors.surface,
        shape = EtalonShapes.sheetTop,
        // The drag handle stays. This sheet SWAPS with `RegionPickerSheet` — the picker replaces
        // it and hands it back — and the picker draws the handle, so dropping it here would make
        // the sheet's own top edge change shape in the middle of one task.
    ) {
        Column(
            Modifier.fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = SHEET_PAD_H, vertical = SHEET_PAD_V),
            verticalArrangement = Arrangement.spacedBy(EtalonSpace.md),
        ) {
            Text(
                stringResource(if (s.isEditing) R.string.client_edit_title else R.string.client_create_title),
                style = EtalonType.sectionTitle,
                color = EtalonColors.ink,
            )
            s.error?.let { ErrorBanner(it) }
            // The number is already on file. Said HERE, beside the form that was just filled in,
            // rather than by closing onto a detail screen under a stranger's name: one mistyped
            // digit reaches this, and so do two firms sharing an owner's mobile. Nothing was
            // created — the name, address and notes just typed were discarded by the server.
            s.existingClientName?.let { NoticeBanner(stringResource(R.string.client_phone_on_file, it)) }
            // The stored number is not nine local digits, and PATCH sends the phone on every
            // save — so nothing else about this client can be changed until it is corrected.
            // Said here, on open, rather than only when the save is refused.
            if (s.storedPhoneInvalid) NoticeBanner(stringResource(R.string.client_stored_phone_invalid))
            // A stored address or note keeps its value on a clear (a null is omitted from the
            // PATCH body), so say so before the operator empties one — and name only the field
            // they actually filled in.
            keepNoticeRes(s)?.let { NoticeBanner(stringResource(it)) }

            // §2's form surface, the one the calculator's client form already draws: one white
            // card, a labelled slot per field, hairlines between them.
            FormCard {
                FormField(stringResource(R.string.client_field_name)) {
                    EtalonTextField(
                        value = s.name,
                        onValueChange = vm::setName,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                // The "+998 " is display-only: the field holds the nine local digits and the
                // ViewModel sends the twelve-digit form, exactly as the drivers sheet does. The
                // digits are DRAWN «90 111 22 33» by the shared `PhoneDigitsMask` — the same
                // grouping the calculator's client form shows, because a customer checking a
                // number read aloud must not have to regroup it in their head on one screen only.
                FormField(stringResource(R.string.client_field_phone)) {
                    EtalonTextField(
                        value = s.phoneDigits,
                        onValueChange = { vm.setPhoneDigits(it.filter { c -> c in '0'..'9' }.take(PHONE_LOCAL_DIGITS)) },
                        modifier = Modifier.fillMaxWidth(),
                        prefix = "+998 ",
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        visualTransformation = PhoneDigitsMask,
                    )
                }
                // `RegionField` publishes no `Modifier`, so the two columns take their width from
                // a weighted box around each — the same pair the calculator's client form draws.
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(EtalonSpace.md)) {
                    Box(Modifier.weight(1f)) {
                        RegionField(stringResource(R.string.client_field_viloyat), s.viloyat) {
                            picking = RegionPick.VILOYAT
                        }
                    }
                    Box(Modifier.weight(1f)) {
                        RegionField(stringResource(R.string.client_field_tuman), s.tuman) {
                            picking = RegionPick.TUMAN
                        }
                    }
                }
                FormField(stringResource(R.string.client_field_street)) {
                    EtalonTextField(
                        value = s.street,
                        onValueChange = vm::setStreet,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                // A note is prose and the server takes 2 000 characters of it, so this is the one
                // field on the sheet that may grow past a line.
                FormField(stringResource(R.string.client_field_notes), divider = false) {
                    EtalonTextField(
                        value = s.notes,
                        onValueChange = vm::setNotes,
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = false,
                        maxLines = NOTES_MAX_LINES,
                    )
                }
            }
            // After a dedup hit there is nothing left to save — `submit()` refuses a second
            // attempt anyway — so the action becomes the one thing still worth doing: open the
            // client that holds the number, which is where the operator can check and correct.
            val existingId = s.savedId
            if (s.existingClientName != null && existingId != null) {
                PrimaryButton(
                    text = stringResource(R.string.client_action_open_existing),
                    onClick = { vm.consumeSaved(); onSaved(existingId) },
                )
            } else {
                // Guarded on the button as well as in the ViewModel: neither client route is
                // server-side idempotent, so a double tap must not become two writes. `loading`
                // is what takes the click away while the call is in flight — `saveAllowed` rather
                // than `canSave` on `enabled`, so the button keeps its indigo fill instead of
                // painting the disabled skin over a save that IS going through.
                PrimaryButton(
                    text = stringResource(R.string.client_action_save),
                    onClick = vm::submit,
                    enabled = s.saveAllowed,
                    loading = s.submitting,
                )
            }
            // The sheet's own bottom edge: the gesture bar's inset plus a little air, the same
            // close every restyled sheet in the app draws.
            Spacer(Modifier.navigationBarsPadding().height(EtalonSpace.sm))
        }
    }
}

/** Which fields the operator is being told they cannot empty — only the ones that hold
 *  something, or nothing at all when neither does. */
private fun keepNoticeRes(s: ClientEditState): Int? = when {
    s.addressLocked && s.notesLocked -> R.string.client_keep_notice_both
    s.addressLocked -> R.string.client_keep_notice_address
    s.notesLocked -> R.string.client_keep_notice_notes
    else -> null
}

// RegionField/RegionPickerSheet moved to `:core:designsystem` (Task 7) so the calculator's
// client bar can share the same picker — see `core/designsystem/components/RegionPicker.kt`.
