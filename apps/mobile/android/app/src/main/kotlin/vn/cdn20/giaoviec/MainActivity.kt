package vn.cdn20.giaoviec

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import io.flutter.embedding.android.FlutterFragmentActivity

/**
 * FlutterFragmentActivity: local_auth (khóa ứng dụng) cần FragmentActivity.
 */
class MainActivity : FlutterFragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Chặn chụp / quay màn hình và ẩn nội dung ở màn hình ứng dụng gần đây.
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        super.onCreate(savedInstanceState)
        createNotificationChannel()
    }

    /** Kênh "Nhắc việc" (mức cao) cho thông báo đẩy; máy chủ gửi channel_id "nhac_viec". */
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            getString(R.string.notification_channel_id),
            getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_HIGH,
        )
        channel.description = getString(R.string.notification_channel_description)
        manager.createNotificationChannel(channel)
    }
}
