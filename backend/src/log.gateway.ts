import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway()
export class LogGateway implements OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	server: Server;

	handleConnection(client: any) {
		console.log('Client connected:', client.id);
	}

	handleDisconnect(client: any) {
		console.log('Client disconnected:', client.id);
	}

	broadcastLog(message: string) {
		this.server.emit('log', message); // Broadcast log to all clients
	}
}
