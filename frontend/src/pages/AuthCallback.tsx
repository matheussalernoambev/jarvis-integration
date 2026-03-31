import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";

const AuthCallback = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Processando autenticação...");

  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const errorParam = params.get('error');
      const errorDescription = params.get('error_description');
      const state = params.get('state');

      // Handle OAuth error response
      if (errorParam) {
        setError(errorDescription || `Erro OAuth: ${errorParam}`);
        return;
      }

      // Validate authorization code
      if (!code) {
        setError('Código de autorização não encontrado na URL');
        return;
      }

      // Validate state (CSRF protection)
      const savedState = sessionStorage.getItem('oauth_state');
      if (state && savedState && state !== savedState) {
        setError('Validação de estado falhou. Possível ataque CSRF.');
        return;
      }

      // Retrieve PKCE verifier
      const codeVerifier = sessionStorage.getItem('pkce_verifier');
      if (!codeVerifier) {
        setError('PKCE verifier não encontrado. Tente fazer login novamente.');
        return;
      }

      try {
        setStatus("Trocando código por tokens...");

        const data = await api.post<{ success: boolean; error?: string; user?: any }>('/auth/microsoft-callback', {
          code,
          code_verifier: codeVerifier,
          redirect_uri: `${window.location.origin}/auth/callback`,
        });

        if (!data?.success) {
          throw new Error(data?.error || 'Resposta inválida do servidor');
        }

        setStatus("Verificando sessão...");

        // Clean up session storage
        sessionStorage.removeItem('pkce_verifier');
        sessionStorage.removeItem('oauth_state');

        // Redirect to home
        navigate('/', { replace: true });
      } catch (err: any) {
        console.error('Auth callback error:', err);
        setError(err.message || 'Erro desconhecido durante autenticação');
      }
    };

    handleCallback();
  }, [navigate]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center space-y-4">
            <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-2">Erro de Autenticação</h2>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => navigate('/auth', { replace: true })}>
                Voltar ao Login
              </Button>
              <Button onClick={() => window.location.reload()}>
                Tentar Novamente
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-background to-muted">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <p className="text-muted-foreground">{status}</p>
      </div>
    </div>
  );
};

export default AuthCallback;
