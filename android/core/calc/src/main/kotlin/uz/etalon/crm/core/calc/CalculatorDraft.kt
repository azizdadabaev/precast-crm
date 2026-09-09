package uz.etalon.crm.core.calc

/**
 * The operator's whole in-progress quote — every room plus who it is for and the project-level
 * discount/delivery/other figures — the unit `:core:data`'s `CalculatorRepository` persists to
 * Room and sends to `POST /api/projects`.
 *
 * Lives beside [SlabRow] rather than in `:core:model` (where the phase-2b brief originally placed
 * it): this class holds a `List<SlabRow>` directly, `:core:calc` already depends on `:core:model`
 * (see `Boundary.kt`), and a `:core:model` type may never depend back on `:core:calc` — Gradle
 * refuses the resulting cycle outright. `SlabRow` itself is already this module's "row layer
 * above the bit-parity engine" (see its own KDoc); this is one step further up the same layer.
 *
 * [clientPhone] carries whatever the caller hands it — `CalculatorRepository.saveDraft`
 * normalises it before it reaches the wire, the same defence-in-depth `ClientsRepository`
 * applies. [clientAddress] is the composed "<Viloyat>, <Tuман>, <street>" string
 * (`uz.etalon.crm.core.ui.regions.composeAddress`), matching the wire and the web's own
 * `calculator-draft-<userId>` localStorage draft.
 *
 * [discountPercent]/[discountAmount] are mutually exclusive at the engine boundary (see
 * `CalculatorViewModel.withTotals`); both travel here so a restored draft reopens in whichever
 * mode was active. [deliveryCost]/[otherCost] are local-only — `SaveProjectDraftSchema` has no
 * such fields (they exist only on Place Order) — so they round-trip through the Room draft but
 * are never sent by `saveDraft`. [projectId] is null until the first successful save; from then
 * on it is what turns a second save into an update instead of a duplicate.
 */
data class CalculatorDraft(
    val rows: List<SlabRow>,
    val clientPhone: String,
    val clientName: String,
    val clientAddress: String,
    val discountPercent: Double,
    val discountAmount: Double,
    val deliveryCost: Double,
    val otherCost: Double,
    val projectId: String?,
)
