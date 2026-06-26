import { ReactNode } from "react";
import AppShell from "./shell/AppShell";

const PlatformLayout = ({ children }: { children: ReactNode }) => {
  return <AppShell>{children}</AppShell>;
};

export default PlatformLayout;
