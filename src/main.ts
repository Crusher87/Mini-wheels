import "./styles.css";
import "./render/markers.css";
import { GameApp } from "./app/GameApp";

const app = new GameApp();

window.addEventListener("beforeunload", () => {
  void app.dispose();
});

void app.initialize();
