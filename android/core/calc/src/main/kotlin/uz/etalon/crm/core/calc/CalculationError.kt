package uz.etalon.crm.core.calc

/**
 * Thrown by [calculateSlab] for invalid [SlabInput]. Messages are the TS `CalculationError`'s
 * English verbatim (`calculation-engine.ts` `validate()`) — they are thrown, never shown; a later
 * slice maps them to Uzbek at the screen.
 *
 * `open`: the TS `GazoblokError` (gazoblok-engine.ts) `extends CalculationError` so callers can
 * still catch a блок error as a `CalculationError`; [uz.etalon.crm.core.calc.gazoblok.GazoblokError]
 * mirrors that subclassing here.
 */
open class CalculationError(message: String) : RuntimeException(message)
