plugins { id("etalon.android.library") }
android { namespace = "uz.etalon.crm.core.model" }
dependencies {
    // Test-only: DashboardMoneyTest pins the "never Double" decode rule at the type-owning
    // layer, using the same JsonPrimitive-to-BigDecimal technique :core:network's DashboardDto
    // implements for real. Not a main dependency — this module still does no wire decoding.
    testImplementation(libs.kotlinx.serialization.json)
}
