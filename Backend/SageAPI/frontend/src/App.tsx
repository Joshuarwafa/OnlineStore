import { ChevronDown, ChevronRight, Moon, Store, Sun } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { createBrowserRouter, Navigate, NavLink, Outlet, RouterProvider } from "react-router-dom";
import { modules } from "./modules";
import { useTheme } from "./shared/theme";

function Layout() {
  const { theme, toggle } = useTheme();
  // A module's sub-pages stay hidden until its name is clicked; clicking it again hides them.
  const [expanded, setExpanded] = useState<string | null>(null);

  const onModuleClick = (e: MouseEvent, id: string, hasSubPages: boolean) => {
    if (!hasSubPages) return setExpanded(null);
    if (expanded === id) {
      e.preventDefault(); // just collapse, stay on the current page
      setExpanded(null);
    } else {
      setExpanded(id);
    }
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Store size={16} />
          </span>
          Store Admin
        </div>
        <nav aria-label="Modules">
          {modules.map((m) => (
            <div key={m.id} className="nav-group">
              <NavLink
                to={`/${m.path}`}
                className="nav-link"
                onClick={(e) => onModuleClick(e, m.id, !!m.nav?.length)}
                aria-expanded={m.nav?.length ? expanded === m.id : undefined}
              >
                <m.icon size={18} aria-hidden="true" />
                {m.label}
                {!!m.nav?.length &&
                  (expanded === m.id ? (
                    <ChevronDown size={15} aria-hidden="true" className="nav-chevron" />
                  ) : (
                    <ChevronRight size={15} aria-hidden="true" className="nav-chevron" />
                  ))}
              </NavLink>
              {expanded === m.id &&
                m.nav?.map((sub) => (
                  <NavLink key={sub.path} to={`/${m.path}/${sub.path}`} className="nav-link nav-sub">
                    <sub.icon size={16} aria-hidden="true" />
                    {sub.label}
                  </NavLink>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button type="button" className="theme-toggle" onClick={toggle}>
            {theme === "light" ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />}
            {theme === "light" ? "Dark mode" : "Light mode"}
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to={`/${modules[0].path}`} replace /> },
      ...modules.map((m) => ({ path: m.path, children: m.routes })),
      { path: "*", element: <p className="banner">Page not found.</p> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
