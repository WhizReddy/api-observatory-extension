"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Home;
const react_1 = require("react");
function Home() {
    const [logs, setLogs] = (0, react_1.useState)([]);
    (0, react_1.useEffect)(() => {
        const socket = new WebSocket('ws://localhost:3001');
        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'log') {
                setLogs((prevLogs) => [...prevLogs, data.message]);
            }
        };
        return () => socket.close();
    }, []);
    return (<div>
			<h1>Live Logs</h1>
			<ul>
				{logs.map((log, index) => (<li key={index}>{log}</li>))}
			</ul>
		</div>);
}
//# sourceMappingURL=index.js.map