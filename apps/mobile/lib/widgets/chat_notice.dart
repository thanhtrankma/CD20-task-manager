import 'package:flutter/material.dart';

import '../util/chat_format.dart';

/// Dòng nhắc nhỏ, luôn hiện trên các màn hình trò chuyện.
class ChatNotice extends StatelessWidget {
  const ChatNotice({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('chat-notice'),
      width: double.infinity,
      color: const Color(0xFFFFF4E0),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      child: const Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.gpp_maybe_outlined, size: 15, color: Color(0xFF9A3412)),
          SizedBox(width: 6),
          Flexible(
            child: Text(
              chatSecretNotice,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, color: Color(0xFF9A3412), fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}
