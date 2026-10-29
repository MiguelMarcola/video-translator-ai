import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { createBrowserRouter, NavLink, Outlet, RouterProvider } from "react-router";
import { HistoryPage } from "@/pages/history-page";
import { HomePage } from "@/pages/home-page";
import { VideoPage } from "@/pages/video-page";
import { cn } from "@/lib/utils";

function Shell() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <NavLink to="/" className="flex min-w-0 items-center gap-3">
            <img src="/voz-em-cena.svg" alt="" className="h-9 w-9 shrink-0" />
            <span className="hidden text-sm font-semibold tracking-tight sm:inline">Voz em Cena</span>
          </NavLink>
          <nav className="flex shrink-0 rounded-full bg-accent p-1" aria-label="Principal">
            <ShellLink to="/">Novo vídeo</ShellLink>
            <ShellLink to="/videos">Histórico</ShellLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}

function ShellLink({ to, children }: { to: string; children: string }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cn(
          "whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium",
          isActive ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground",
        )
      }
    >
      {children}
    </NavLink>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <Shell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "videos", element: <HistoryPage /> },
      { path: "videos/:videoId", element: <VideoPage /> },
    ],
  },
]);

export function App() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
