import { useEffect, useState } from 'react';

export default function Home() {
	const [logs, setLogs] = useState<string[]>([]);

	useEffect(() => {
		const socket = new WebSocket('ws://localhost:3001');

		socket.onmessage = (event) => {
			const data = JSON.parse(event.data);
			if (data.type === 'log') {
				setLogs((prevLogs) => [...prevLogs, data.message]);
			}
		};

		return () => socket.close();
	}, []);

	return (
		<div>
			<h1>Live Logs</h1>
			<ul>
				{logs.map((log, index) => (
					<li key={index}>{log}</li>
				))}
			</ul>
		</div>
	);
}
