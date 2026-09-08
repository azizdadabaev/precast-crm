package uz.etalon.crm.core.calc

/**
 * Thrown by [calculateSlab] for invalid [SlabInput]. Messages are the TS `CalculationError`'s
 * English verbatim (`calculation-engine.ts` `validate()`) — they are thrown, never shown; a later
 * slice maps them to Uzbek at the screen.
 */
class CalculationError(message: String) : RuntimeException(message)
