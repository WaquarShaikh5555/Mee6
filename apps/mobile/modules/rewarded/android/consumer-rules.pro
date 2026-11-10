# Google's Mobile Ads SDK, kept whole.
#
# Release builds enable R8 (android.enableMinifyInReleaseBuilds=true), and R8
# happily strips classes an SDK only reaches reflectively — the classic result
# being a crash on the first line of startup, on a phone, never in a test.
# The SDK ships its own rules, but they have changed between versions and this
# app cannot afford another silent strip.
-keep class com.google.android.gms.ads.** { *; }
-keep class com.google.android.gms.internal.ads.** { *; }
-dontwarn com.google.android.gms.**
