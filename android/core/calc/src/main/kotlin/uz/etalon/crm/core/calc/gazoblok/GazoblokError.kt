package uz.etalon.crm.core.calc.gazoblok

import uz.etalon.crm.core.calc.CalculationError

/**
 * Verbatim port of `GazoblokError` in `gazoblok-engine.ts`: a distinct error type so call sites
 * can tell a блок error from a floor-engine error, while still being catchable as
 * [CalculationError] (`handler()` in the server's `src/lib/api.ts` treats any `CalculationError`
 * as a 400). Messages are the TS engine's English/Uzbek verbatim — thrown, never shown; a later
 * slice maps them to Uzbek at the screen.
 */
class GazoblokError(message: String) : CalculationError(message)
