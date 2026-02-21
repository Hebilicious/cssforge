import { h } from "vue";
import DefaultTheme from "vitepress/theme-without-fonts";
import AnvilAnimation from "./AnvilAnimation.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      "home-hero-image": () => h(AnvilAnimation),
    });
  },
};
