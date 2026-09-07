plugins { id("etalon.android.library") }
android { namespace = "uz.etalon.crm.core.testing" }
dependencies {
    // `api`, not `implementation`: a consumer's test subclasses FakeEtalonApi and overrides its
    // members, so EtalonApi, the DTOs and the okhttp/kotlinx types those signatures name must all
    // reach the consumer's compile classpath. :core:network keeps them `implementation`.
    api(project(":core:network"))
    api(libs.okhttp)
    api(libs.kotlinx.serialization.json)
}
