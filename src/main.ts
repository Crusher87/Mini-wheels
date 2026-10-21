import "./styles.css";
import "./render/markers.css";
import { GameApp } from "./app/GameApp";

const app = new GameApp();

window.addEventListener("pagehide", (event) => {
  // A page kept in the back/forward cache must stay alive so it works when restored.
  if (!event.persisted) {
    void app.dispose();
  }
});

void app.initialize();
