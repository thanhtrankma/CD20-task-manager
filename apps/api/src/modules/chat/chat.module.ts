import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatEventsService } from './chat-events.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [AuthModule],
  controllers: [ChatController],
  providers: [ChatService, ChatEventsService],
})
export class ChatModule {}
