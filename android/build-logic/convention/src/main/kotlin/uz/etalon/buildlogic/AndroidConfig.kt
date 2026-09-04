package uz.etalon.buildlogic

/** Single place for SDK levels. Spec D1: Android 16 floor, owner-confirmed;
 *  lowering to 28 is a one-line change here. */
object AndroidConfig {
    /** 37, not 36: the current AndroidX/Compose releases require compiling against
     *  API 37. compileSdk only controls which APIs are visible at compile time —
     *  device support (MIN_SDK) and runtime behaviour (TARGET_SDK) stay on 36. */
    const val COMPILE_SDK = 37
    const val TARGET_SDK = 36
    const val MIN_SDK = 36
}
