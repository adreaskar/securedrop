import { useState } from "react";
import { Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";

export default function Auth() {
  const { signIn, signUp, initialized } = useAuth();
  const [redirecting, setRedirecting] = useState(false);

  const handleSignIn = () => {
    setRedirecting(true);
    signIn();
  };

  const handleSignUp = () => {
    setRedirecting(true);
    signUp();
  };

  // Show loading while Keycloak initializes
  if (!initialized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Show loading while redirecting to Keycloak
  if (redirecting) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Redirecting to Keycloak...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-xl border-border/50">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl text-center">Welcome back</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Button onClick={handleSignIn} className="w-full" size="lg">
                Sign In with Keycloak
              </Button>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or
                  </span>
                </div>
              </div>
              <Button
                onClick={handleSignUp}
                variant="outline"
                className="w-full"
                size="lg"
              >
                Create New Account
              </Button>
            </div>
            <p className="text-xs text-center text-muted-foreground mt-4">
              By continuing, you agree to our Terms of Service and Privacy
              Policy
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
