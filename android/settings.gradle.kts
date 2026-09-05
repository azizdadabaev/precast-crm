pluginManagement {
    includeBuild("build-logic")
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories { google(); mavenCentral() }
}
rootProject.name = "EtalonCRM"
include(":app")
include(":core:designsystem", ":core:model", ":core:ui", ":core:network", ":core:datastore", ":core:database", ":core:data", ":core:testing", ":core:image", ":core:sync")
include(":feature:auth", ":feature:orders")
