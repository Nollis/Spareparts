import { mount } from "svelte";
import "./app.css";
import "./public.css";
import "flag-icons/css/flag-icons.min.css";
import "semantic-ui-css/semantic.min.css";
import App from "./App.svelte";

const app = mount(App, {
  target: document.getElementById("app")
});

export default app;
