import { APP_ICON } from "@/lib/app-icon";

/** 131: Riki Maps' icon, drawn as the app draws it; a picture beside words that name it. */
export function AppIcon({ size, className }: { size: number; className?: string }) {
  return (
    <span className={`app-icon${className ? ` ${className}` : ""}`} aria-hidden="true" data-app-icon=""
      style={{ width: size, height: size, backgroundImage: `url(${APP_ICON})` }} />
  );
}
