"""
Anthropic Service — sends credential failure data to Claude for intelligent analysis.
Returns structured JSON with diagnosis, category, suggested action, and card content.
"""

import json
import logging

import httpx

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Você é um especialista sênior em infraestrutura, segurança e BeyondTrust Password Safe.

Sua tarefa é analisar erros de rotação de credenciais (password change failures) em managed accounts e retornar um diagnóstico estruturado em JSON.

Regras:
1. Analise o erro completo incluindo cada tentativa de conexão descrita
2. Identifique a causa raiz principal (não apenas o sintoma)
3. Considere o contexto da máquina (hostname, plataforma, workgroup)
4. Considere o resultado do teste de ping (se fornecido): se o host não respondeu ao ping, isso indica que a máquina pode estar desligada, inacessível por rede/firewall, ou com ICMP bloqueado. Inclua essa informação no diagnóstico.
5. Sugira uma ação concreta e específica para resolver
6. Gere um título de card de trabalho claro e conciso (máximo 120 caracteres)
7. Gere uma descrição detalhada para o card incluindo todos os dados relevantes (incluindo resultado do ping)
8. A descrição do card deve ser em formato HTML para Azure DevOps

Categorias válidas (escolha a mais específica):
- account_not_found: Conta gerenciada não existe no sistema alvo
- access_denied: Permissão negada / acesso bloqueado
- network_unreachable: Sistema alvo inacessível (rede/DNS/firewall)
- authentication_failed: Functional Account não consegue autenticar
- password_policy: Senha não atende política de complexidade
- account_locked: Conta travada/bloqueada
- service_dependency: Serviço dependente impede a troca
- timeout: Timeout na operação
- certificate_error: Erro de certificado SSL/TLS
- configuration_error: Configuração incorreta no BeyondTrust
- unknown: Não foi possível classificar

Retorne APENAS JSON válido (sem markdown, sem texto extra) com esta estrutura:
{
  "category": "string",
  "diagnosis": "string (explicação técnica em português, 2-4 frases)",
  "suggested_action": "string (ação recomendada específica em português)",
  "platform_type": "string (ex: Windows Server, Linux, Active Directory, Network Device, Database)",
  "confidence": 0.0-1.0,
  "card_title": "string (título conciso para work item, em português)",
  "card_description": "string (HTML formatado para Azure DevOps com seções: Problema, Diagnóstico, Ação Recomendada, Dados Técnicos)"
}"""

FEW_SHOT_EXAMPLES = [
    {
        "role": "user",
        "content": """Analise este erro de rotação de credencial:

Hostname: SRVWEB001
Plataforma: Windows
Workgroup: NAZ-Resource_Zone Workgroup
Conta: WindowsAdmin
ManagedAccountID: 12345

Erro capturado:
Defined hosts: -,10.0.1.50
Change Managed Account password using Functional Account on Windows system: Host=-, Account='WindowsAdmin', FunctionalAccount='domain\\svc_bt'
Logon with "domain\\svc_bt" credentials failed! The network path was not found.
Failed to logon with FA
Change Managed Account password using Functional Account on Windows system: Host=10.0.1.50, Account='WindowsAdmin', FunctionalAccount='domain\\svc_bt'
Logon was successful.
Failed to set password for "WindowsAdmin": Access is denied.
Password change failed"""
    },
    {
        "role": "assistant",
        "content": json.dumps({
            "category": "access_denied",
            "diagnosis": "A Functional Account 'domain\\svc_bt' consegue autenticar no host 10.0.1.50, mas não tem permissão para alterar a senha da conta 'WindowsAdmin'. O primeiro host (hostname) não foi encontrado na rede. A causa raiz é falta de privilégio da FA para reset de senha neste servidor.",
            "suggested_action": "Verificar se a Functional Account 'domain\\svc_bt' possui privilégio de 'Reset Password' na conta 'WindowsAdmin' no servidor SRVWEB001 (10.0.1.50). Adicionar a FA ao grupo local Administrators ou conceder o direito específico via GPO.",
            "platform_type": "Windows Server",
            "confidence": 0.92,
            "card_title": "[PS] Acesso negado ao trocar senha de WindowsAdmin em SRVWEB001",
            "card_description": "<h3>Problema</h3><p>A rotação automática de senha da conta <b>WindowsAdmin</b> no servidor <b>SRVWEB001</b> (10.0.1.50) está falhando com erro de acesso negado.</p><h3>Diagnóstico</h3><p>A Functional Account consegue autenticar no host, mas não possui permissão para alterar a senha da conta gerenciada. Categoria: <b>Access Denied</b></p><h3>Ação Recomendada</h3><p>Verificar e conceder privilégio de Reset Password à Functional Account no servidor alvo.</p><h3>Dados Técnicos</h3><ul><li>ManagedAccountID: 12345</li><li>Conta: WindowsAdmin</li><li>Sistema: SRVWEB001</li><li>FA: domain\\svc_bt</li><li>Workgroup: NAZ-Resource_Zone Workgroup</li></ul>"
        }, ensure_ascii=False)
    },
    {
        "role": "user",
        "content": """Analise este erro de rotação de credencial:

Hostname: DBPROD003
Plataforma: Windows
Workgroup: MAZ_Resource_Zone Workgroup
Conta: svc_backup
ManagedAccountID: 67890

Erro capturado:
Defined hosts: -,172.16.5.20
Change Managed Account password using Functional Account on Windows system: Host=-, Account='svc_backup', FunctionalAccount='corp\\bt_service'
Logon with "corp\\bt_service" credentials failed! The network path was not found.
Change Managed Account password using Functional Account on Windows system: Host=172.16.5.20, Account='svc_backup', FunctionalAccount='corp\\bt_service'
Logon was successful.
Failed to get user "svc_backup" object
Problem with MA. Managed Account does not exist on the system.
Password change failed"""
    },
    {
        "role": "assistant",
        "content": json.dumps({
            "category": "account_not_found",
            "diagnosis": "A Functional Account consegue conectar ao host 172.16.5.20, porém a conta gerenciada 'svc_backup' não existe no sistema DBPROD003. A conta pode ter sido removida, renomeada ou nunca foi criada neste servidor.",
            "suggested_action": "Verificar se a conta 'svc_backup' existe no servidor DBPROD003. Se foi removida intencionalmente, desassociar a managed account no BeyondTrust. Se foi renomeada, atualizar o AccountName no BeyondTrust.",
            "platform_type": "Windows Server",
            "confidence": 0.97,
            "card_title": "[PS] Conta svc_backup não encontrada em DBPROD003",
            "card_description": "<h3>Problema</h3><p>A conta gerenciada <b>svc_backup</b> não existe no servidor <b>DBPROD003</b> (172.16.5.20). A rotação automática de senha está falhando.</p><h3>Diagnóstico</h3><p>O BeyondTrust consegue conectar ao servidor via Functional Account, mas ao tentar localizar a conta 'svc_backup' recebe erro 'Managed Account does not exist on the system'. Categoria: <b>Account Not Found</b></p><h3>Ação Recomendada</h3><p>Verificar se a conta existe no servidor. Se removida, desassociar do BeyondTrust. Se renomeada, atualizar o cadastro.</p><h3>Dados Técnicos</h3><ul><li>ManagedAccountID: 67890</li><li>Conta: svc_backup</li><li>Sistema: DBPROD003</li><li>FA: corp\\bt_service</li><li>Workgroup: MAZ_Resource_Zone Workgroup</li></ul>"
        }, ensure_ascii=False)
    },
]


async def analyze_credential_failure(
    api_key: str,
    model: str,
    error_raw: str,
    hostname: str,
    platform: str,
    workgroup: str,
    account_name: str,
    managed_account_id: int,
    account_data: dict | None = None,
    ping_result: dict | None = None,
    db=None,
    zone_id: str | None = None,
) -> dict:
    """
    Send credential failure data to Claude for analysis.
    Returns parsed JSON with diagnosis, category, action, and card content.

    If db and zone_id are provided, loads zone-specific few-shot examples
    from confirmed feedback to enrich the prompt.
    """
    # Build context
    extra_context = ""
    if account_data:
        extra_context = f"""
Dados adicionais da conta:
- DomainName: {account_data.get('DomainName', 'N/A')}
- AutoManagementFlag: {account_data.get('AutoManagementFlag', 'N/A')}
- ChangeFrequencyDays: {account_data.get('ChangeFrequencyDays', 'N/A')}
- LastChangeDate: {account_data.get('LastChangeDate', 'N/A')}
- NextChangeDate: {account_data.get('NextChangeDate', 'N/A')}
- ChangeState: {account_data.get('ChangeState', 'N/A')}
- PasswordRuleID: {account_data.get('PasswordRuleID', 'N/A')}
- CheckPasswordFlag: {account_data.get('CheckPasswordFlag', 'N/A')}"""

    # Ping test context
    ping_context = ""
    if ping_result:
        if ping_result.get("alive"):
            ping_context = f"\nTeste de ping: Host RESPONDEU (alive) — latência {ping_result.get('latency_ms', 'N/A')}ms"
        else:
            ping_context = f"\nTeste de ping: Host NÃO RESPONDEU (unreachable) — {ping_result.get('detail', 'sem detalhes')}"

    user_message = f"""Analise este erro de rotação de credencial:

Hostname: {hostname}
Plataforma: {platform}
Workgroup: {workgroup}
Conta: {account_name}
ManagedAccountID: {managed_account_id}
{extra_context}{ping_context}

Erro capturado:
{error_raw}"""

    # Load zone-specific few-shot examples from feedback loop
    dynamic_examples = []
    if db and zone_id:
        try:
            from app.services.few_shot_service import load_zone_few_shot_examples
            dynamic_examples = await load_zone_few_shot_examples(db, zone_id)
        except Exception as e:
            logger.warning(f"[Anthropic] Failed to load zone examples: {e}")

    messages = FEW_SHOT_EXAMPLES + dynamic_examples + [{"role": "user", "content": user_message}]

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": model,
                    "max_tokens": 2048,
                    "system": SYSTEM_PROMPT,
                    "messages": messages,
                },
            )

            if resp.status_code != 200:
                logger.error(f"[Anthropic] API returned {resp.status_code}: {resp.text[:300]}")
                return {"error": f"Anthropic API returned {resp.status_code}", "raw_response": resp.text[:500]}

            data = resp.json()
            content_text = data.get("content", [{}])[0].get("text", "")

            # Parse JSON from response
            try:
                result = json.loads(content_text)
                logger.info(f"[Anthropic] Analysis complete: category={result.get('category')}, confidence={result.get('confidence')}")
                return result
            except json.JSONDecodeError:
                logger.error(f"[Anthropic] Failed to parse JSON: {content_text[:300]}")
                return {"error": "Failed to parse AI response as JSON", "raw_response": content_text[:500]}

    except Exception as e:
        logger.error(f"[Anthropic] Request failed: {e}")
        return {"error": str(e)}


async def add_feedback_example(analysis: dict, is_correct: bool) -> dict | None:
    """
    Convert a confirmed-correct analysis into a few-shot example format.
    Returns a user/assistant message pair that can be appended to FEW_SHOT_EXAMPLES.
    """
    if not is_correct:
        return None

    return {
        "user": f"Analise este erro de rotação de credencial:\n\n{analysis.get('error_raw', '')}",
        "assistant": json.dumps({
            "category": analysis.get("ai_category"),
            "diagnosis": analysis.get("ai_diagnosis"),
            "suggested_action": analysis.get("suggested_action"),
            "platform_type": analysis.get("suggested_platform_type"),
            "confidence": analysis.get("ai_confidence"),
            "card_title": analysis.get("card_title"),
            "card_description": analysis.get("card_description"),
        }, ensure_ascii=False),
    }
