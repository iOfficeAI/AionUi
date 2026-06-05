import json, os

en_dir = r'packages\desktop\src\renderer\services\i18n\locales\en-US'
pt_dir = r'packages\desktop\src\renderer\services\i18n\locales\pt-BR'

T = {
    "Send": "Enviar", "Cancel": "Cancelar", "Save": "Salvar", "Delete": "Excluir", "Confirm": "Confirmar",
    "File": "Arquivo", "Folder": "Pasta", "Upload": "Enviar", "Model": "Modelo", "Skills": "Habilidades",
    "Settings": "Configuracoes", "System": "Sistema", "About Us": "Sobre", "Back to Chat": "Voltar ao Chat",
    "Add": "Adicionar", "Edit": "Editar", "Website": "Site", "Version": "Versao", "Contact": "Contato",
    "Github": "GitHub", "Please wait...": "Aguarde...", "Copy": "Copiar", "Reply": "Responder",
    "Copied": "Copiado", "Copy failed": "Falha ao copiar", "Download": "Baixar", "Close": "Fechar",
    "Retry": "Tentar novamente", "Reload": "Recarregar", "Technical Details": "Detalhes Tecnicos",
    "Error Details": "Detalhes do Erro", "Troubleshooting": "Solucao de Problemas", "Select": "Selecionar",
    "Expand More": "Expandir Mais", "Collapse": "Recolher", "Success": "Sucesso", "Error": "Erro",
    "Saved successfully": "Salvo com sucesso", "Failed to save": "Falha ao salvar",
    "Unknown error": "Erro desconhecido", "Confirm Delete": "Confirmar Exclusao",
    "Deleted successfully": "Excluido com sucesso", "Failed to delete": "Falha ao excluir",
    "Default": "Padrao", "Default Model": "Modelo Padrao", "esc to cancel": "esc para cancelar",
    "Create": "Criar", "Created successfully": "Criado com sucesso", "Failed": "Falhou", "Browse": "Navegar",
    "Remove": "Remover", "Show": "Mostrar", "Hide": "Ocultar", "Go to Settings": "Ir para Configuracoes",
    "Forward": "Avancar", "Back": "Voltar", "More": "Mais", "Refresh": "Atualizar",
    "Expand": "Expandir", "Name": "Nome", "Added": "Adicionado", "Status": "Status", "Agent Mode": "Modo Agente",
    "Refreshed": "Atualizado", "Import": "Importar", "Processing...": "Processando...",
    "(optional)": "(opcional)", "Clear": "Limpar", "Add files": "Adicionar arquivos",
    "Upload from device": "Enviar do dispositivo", "Upload failed": "Falha no envio",
    "Uploading...": "Enviando...", "Upload successful": "Envio concluido",
    "Cancel upload": "Cancelar envio", "m": "min", "s": "s",
    "Enter": "Entrar", "Username": "Usuario", "Password": "Senha",
    "Type a message...": "Digite uma mensagem...",
    "Send message": "Enviar mensagem", "Stop generation": "Parar geracao",
    "Scheduled Tasks": "Tarefas Agendadas", "Create Task": "Criar Tarefa",
    "Edit Task": "Editar Tarefa", "Delete Task": "Excluir Tarefa",
    "Pause": "Pausar", "Resume": "Retomar", "Run Now": "Executar Agora",
    "Schedule": "Agendamento", "Cron Expression": "Expressao Cron", "Interval": "Intervalo",
    "One Time": "Unica Vez", "Task Name": "Nome da Tarefa", "Prompt": "Comando",
    "Next Run": "Proxima Execucao", "Last Run": "Ultima Execucao",
    "Active": "Ativa", "Paused": "Pausada", "Completed": "Concluida",
    "Running": "Executando", "Timezone": "Fuso Horario",
    "No file selected": "Nenhum arquivo selecionado", "Loading...": "Carregando...",
    "Code": "Codigo", "Markdown": "Markdown", "Image": "Imagem", "PDF": "PDF", "Office": "Office",
    "Text": "Texto", "HTML": "HTML", "Diff": "Diferencas",
    "Software update": "Atualizacao de software",
    "Update available": "Atualizacao disponivel", "Download": "Baixar",
    "Download & Install": "Baixar e Instalar", "Update failed": "Falha na atualizacao",
    "New File": "Novo Arquivo", "Deleted File": "Arquivo Excluido", "Modified": "Modificado",
    "File Changes": "Alteracoes", "Shell Command": "Comando Shell",
    "File Operations": "Operacoes de Arquivo", "Web Search": "Busca Web",
    "Unknown Tool": "Ferramenta Desconhecida", "Pending": "Pendente", "Executing": "Executando",
    "Canceled": "Cancelado", "Tool": "Ferramenta", "create": "criar", "modify": "modificar", "delete": "excluir",
    "Auto-approved": "Auto-aprovado", "Manual approval": "Aprovacao manual",
    "Teams": "Equipes", "New Team": "Nova Equipe", "Pin": "Fixar", "Unpin": "Desafixar",
    "Rename": "Renomear", "New Agent": "Novo Agente",
    "Create Team": "Criar Equipe", "Project": "Projeto",
    "Virtual Pet": "Pet Virtual", "Idle": "Parado", "Walking": "Andando",
    "Sleeping": "Dormindo", "Eating": "Comendo", "Playing": "Brincando",
}

def translate_value(v):
    if not isinstance(v, str) or not v:
        return v
    if v in T:
        return T[v]
    return v

def translate_dict(d):
    result = {}
    for k, v in d.items():
        if isinstance(v, dict):
            result[k] = translate_dict(v)
        elif isinstance(v, list):
            result[k] = [translate_value(x) if isinstance(x, str) else x for x in v]
        elif isinstance(v, str):
            result[k] = translate_value(v)
        else:
            result[k] = v
    return result

files = ["acp.json","agent.json","agentMode.json","codex.json","common.json","conversation.json","cron.json","fileSelection.json","google.json","guid.json","login.json","mcp.json","messages.json","pet.json","preview.json","settings.json","starOffice.json","team.json","tools.json","update.json"]

count = 0
for f in files:
    with open(os.path.join(en_dir, f), "r", encoding="utf-8") as fp:
        en = json.load(fp)
    pt = translate_dict(en)
    with open(os.path.join(pt_dir, f), "w", encoding="utf-8") as fp:
        json.dump(pt, fp, ensure_ascii=False, indent=2)
    count += 1
    print(f"{count}. {f}: OK (chaves: {len(en)})")

print(f"\n{count} arquivos corrigidos. Chaves identicas ao en-US!")
