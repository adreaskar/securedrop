import {
  useState,
  useEffect,
  createContext,
  useContext,
  ReactNode,
} from "react";
import keycloak from "@/lib/keycloak";

interface User {
  id: string;
  email: string;
  name?: string;
  username?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  signUp: () => Promise<{ error: Error | null }>;
  signIn: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  initialized: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const initKeycloak = async () => {
      try {
        // Check if we're on a protected route that needs authentication
        const isProtectedRoute =
          window.location.pathname.startsWith("/dashboard") ||
          window.location.pathname.startsWith("/inbox");

        // Use 'check-sso' for protected routes to process auth callback
        // Use undefined for public routes to avoid unnecessary checks
        const authenticated = await keycloak.init({
          onLoad: isProtectedRoute ? "check-sso" : undefined,
          pkceMethod: "S256",
          checkLoginIframe: false,
        });

        if (authenticated && keycloak.tokenParsed) {
          const userInfo: User = {
            id: keycloak.tokenParsed.sub || "",
            email: keycloak.tokenParsed.email || "",
            name: keycloak.tokenParsed.name,
            username: keycloak.tokenParsed.preferred_username,
          };

          setUser(userInfo);
          setToken(keycloak.token || null);
        } else {
          console.log("[AUTH] Not authenticated or no token parsed");
        }

        setInitialized(true);
        setLoading(false);

        // Token refresh
        keycloak.onTokenExpired = () => {
          keycloak.updateToken(30).catch(() => {
            console.error("[AUTH] Failed to refresh token");
            signOut();
          });
        };

        // Auth success callback
        keycloak.onAuthSuccess = () => {
          if (keycloak.tokenParsed) {
            const userInfo: User = {
              id: keycloak.tokenParsed.sub || "",
              email: keycloak.tokenParsed.email || "",
              name: keycloak.tokenParsed.name,
              username: keycloak.tokenParsed.preferred_username,
            };

            setUser(userInfo);
            setToken(keycloak.token || null);
          }
        };

        // Auth logout callback
        keycloak.onAuthLogout = () => {
          setUser(null);
          setToken(null);
        };
      } catch (error) {
        setLoading(false);
        setInitialized(true);
      }
    };

    initKeycloak();
  }, []);

  const signUp = async () => {
    try {
      keycloak.register({
        redirectUri: window.location.origin + "/dashboard",
      });
      return { error: null };
    } catch (error) {
      console.error("[AUTH] Registration error:", error);
      return { error: error as Error };
    }
  };

  const signIn = async () => {
    try {
      await keycloak.login({
        redirectUri: window.location.origin + "/dashboard",
      });
      return { error: null };
    } catch (error) {
      console.error("[AUTH] Login error:", error);
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    try {
      await keycloak.logout({
        redirectUri: window.location.origin,
      });
    } catch (error) {
      console.error("[AUTH] Logout failed:", error);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, token, loading, signUp, signIn, signOut, initialized }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
