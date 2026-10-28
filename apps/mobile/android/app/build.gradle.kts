import java.util.Base64

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

/**
 * Cấu hình Firebase lấy từ --dart-define (FCM_API_KEY, FCM_APP_ID_ANDROID, FCM_SENDER_ID, FCM_PROJECT_ID),
 * không dùng google-services.json và plugin google-services. Có đủ giá trị thì sinh các tài nguyên chuỗi giống
 * plugin google-services để Firebase tự khởi tạo cả khi ứng dụng được mở do thông báo (Dart chưa chạy).
 */
val dartDefines: Map<String, String> =
    (project.findProperty("dart-defines") as String?)
        ?.split(",")
        ?.mapNotNull { encoded ->
            runCatching { String(Base64.getDecoder().decode(encoded), Charsets.UTF_8) }.getOrNull()
        }
        ?.mapNotNull { pair ->
            val i = pair.indexOf('=')
            if (i > 0) pair.substring(0, i) to pair.substring(i + 1) else null
        }
        ?.toMap()
        ?: emptyMap()

fun firebaseValue(key: String): String? = dartDefines[key]?.trim()?.takeIf { it.isNotEmpty() }

android {
    namespace = "vn.cdn20.giaoviec"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    buildFeatures {
        // Cần cho resValue (cấu hình Firebase từ dart-define) — AGP 9 mặc định tắt.
        resValues = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // Mã ứng dụng của Nhà trường.
        applicationId = "vn.cdn20.giaoviec"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName

        val apiKey = firebaseValue("FCM_API_KEY")
        val appId = firebaseValue("FCM_APP_ID_ANDROID")
        val senderId = firebaseValue("FCM_SENDER_ID")
        val projectId = firebaseValue("FCM_PROJECT_ID")
        if (apiKey != null && appId != null && senderId != null && projectId != null) {
            resValue("string", "google_app_id", appId)
            resValue("string", "google_api_key", apiKey)
            resValue("string", "gcm_defaultSenderId", senderId)
            resValue("string", "project_id", projectId)
        }
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
