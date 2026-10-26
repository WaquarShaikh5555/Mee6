# PdfBox-Android can decode JPEG-2000 images, but the codec it calls for that
# (com.gemalto.jp2) is an optional dependency it does not ship. Without this,
# R8 refuses the release build over two classes that are simply not there.
-dontwarn com.gemalto.jp2.**

# Shrinking may drop whatever it likes, but the names stay put: the build's own
# check reads them out of the DEX to prove the engine really shipped.
-keepnames class com.tom_roush.pdfbox.** { *; }
