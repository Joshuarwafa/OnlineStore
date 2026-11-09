import { useEffect } from "react";
import { createLocalSetting } from "./localSetting";

export type Theme = "light" | "dark";

const themeSetting = createLocalSetting<Theme>("storeAdmin.theme", "light");

// Light by default; the choice is remembered in this browser.
export function useTheme() {
  const [theme, setTheme] = themeSetting.use();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return { theme, toggle: () => setTheme(theme === "light" ? "dark" : "light") };
}
