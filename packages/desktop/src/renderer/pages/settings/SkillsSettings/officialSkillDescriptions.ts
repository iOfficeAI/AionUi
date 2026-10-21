/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Localized descriptions for the official (built-in, non auto-inject) skills.
 *
 * The canonical descriptions come from the backend's builtin-skills corpus
 * (SKILL.md frontmatter, source of truth: AionCore
 * crates/aionui-app/assets/builtin-skills). The backend serves a single
 * English (or original-language) description, so this module maps each
 * official skill's stable id (its name) to a full 13-locale description set.
 *
 * - `en-US` entries are the canonical text verbatim.
 * - The other locales are translations of that canonical text.
 * - Skills not present in the map (custom / extension / auto-inject) are
 *   rendered with their backend description untouched.
 */

import { resolveLocaleKey } from '@/common/utils';

/** The 13 UI locale keys, kept in sync with the return type of resolveLocaleKey. */
type LocaleKey = ReturnType<typeof resolveLocaleKey>;

type OfficialSkillDescriptions = Record<LocaleKey, string>;

export const OFFICIAL_SKILL_DESCRIPTIONS: Record<string, OfficialSkillDescriptions> = {
  'aionui-troubleshooting': {
    'en-US':
      'Diagnose a running AionUi installation: inspect stuck or errored conversations, read provider health, scheduled task state, MCP server health, team member state, backend health, and aioncore logs. Use when the user reports AionUi is misbehaving, a conversation is stuck, an LLM/provider call is failing, a scheduled task did not run, an MCP server has no tools, a team member is hung, or they ask to troubleshoot AionUi.',
    'zh-CN':
      '诊断运行中的 AionUi 安装：检查卡住或出错的会话，查看服务商（provider）健康状态、定时任务状态、MCP 服务器健康、团队成员状态、后端健康以及 aioncore 日志。当用户反馈 AionUi 行为异常、会话卡住、LLM/服务商调用失败、定时任务未执行、MCP 服务器没有工具、团队成员挂起，或请求排查 AionUi 问题时使用。',
    'zh-TW':
      '診斷運行中的 AionUi 安裝：檢查卡住或出錯的對話，查看提供者（provider）健康狀態、排程任務狀態、MCP 伺服器健康、團隊成員狀態、後端健康與 aioncore 日誌。當使用者回報 AionUi 行為異常、對話卡住、LLM/提供者呼叫失敗、排程任務未執行、MCP 伺服器沒有工具、團隊成員掛起，或要求排查 AionUi 問題時使用。',
    'ja-JP':
      '実行中のAionUiインストールを診断します：スタックした会話やエラーになった会話を調べ、プロバイダーの健全性、スケジュールタスクの状態、MCPサーバーの健全性、チームメンバーの状態、バックエンドの健全性、aioncoreログを確認します。ユーザーがAionUiの動作不良、会話のスタック、LLM/プロバイダー呼び出しの失敗、スケジュールタスクの未実行、MCPサーバーのツール欠落、チームメンバーのハングを報告したとき、またはAionUiのトラブルシューティングを依頼したときに使用します。',
    'ko-KR':
      '실행 중인 AionUi 설치 환경을 진단합니다: 멈추거나 오류가 발생한 대화를 확인하고, 공급자 상태, 예약 작업 상태, MCP 서버 상태, 팀원 상태, 백엔드 상태 및 aioncore 로그를 검사합니다. 사용자가 AionUi가 이상 동작하거나, 대화가 멈추었거나, LLM/공급자 호출이 실패하거나, 예약 작업이 실행되지 않았거나, MCP 서버에 도구가 없거나, 팀원이 응답하지 않는 상황을 보고하거나 AionUi 문제 해결을 요청할 때 사용합니다.',
    'de-DE':
      'Diagnostiziert eine laufende AionUi-Installation: untersucht hängende oder fehlerhafte Konversationen, Provider-Status, Zustand geplanter Aufgaben, MCP-Server-Status, Team-Mitgliederstatus, Backend-Status und Aioncore-Logs. Verwenden Sie dies, wenn der Benutzer meldet, dass AionUi sich falsch verhält, eine Konversation hängt, ein LLM-/Provider-Aufruf fehlschlägt, eine geplante Aufgabe nicht ausgeführt wurde, ein MCP-Server keine Tools hat, ein Team-Mitglied hängt oder um Hilfe bei der Fehlerbehebung von AionUi bittet.',
    'es-ES':
      'Diagnostica una instalación de AionUi en ejecución: inspecciona conversaciones atascadas o con errores, estado del proveedor, estado de las tareas programadas, estado de los servidores MCP, estado de los miembros del equipo, estado del backend y registros de aioncore. Úsalo cuando el usuario informe de que AionUi se comporta mal, una conversación está atascada, falla una llamada a LLM/proveedor, una tarea programada no se ejecutó, un servidor MCP no tiene herramientas, un miembro del equipo está colgado o pide ayuda para solucionar problemas de AionUi.',
    'fr-FR':
      'Diagnostique une installation AionUi en cours d’exécution : examinez les conversations bloquées ou en erreur, l’état du fournisseur, l’état des tâches planifiées, l’état des serveurs MCP, l’état des membres de l’équipe, l’état du backend et les journaux aioncore. À utiliser lorsque l’utilisateur signale un dysfonctionnement d’AionUi, une conversation bloquée, un échec d’appel LLM/fournisseur, une tâche planifiée non exécutée, un serveur MCP sans outils, un membre d’équipe suspendu, ou demande de diagnostiquer AionUi.',
    'pt-BR':
      'Diagnostique uma instalação do AionUi em execução: inspecione conversas travadas ou com erro, estado do provedor, estado de tarefas agendadas, estado dos servidores MCP, estado dos membros da equipe, estado do backend e logs do aioncore. Use quando o usuário relatar mau funcionamento do AionUi, uma conversa travada, falha em chamada de LLM/provedor, tarefa agendada que não foi executada, servidor MCP sem ferramentas, membro da equipe travado ou pedir ajuda para solucionar problemas do AionUi.',
    'ru-RU':
      'Диагностика работающей установки AionUi: проверка зависших или ошибочных диалогов, состояния провайдера, состояния запланированных задач, состояния MCP-серверов, состояния участников команды, состояния бэкенда и журналов aioncore. Используйте, когда пользователь сообщает о некорректной работе AionUi, зависшем диалоге, сбое вызова LLM/провайдера, невыполненной запланированной задаче, MCP-сервере без инструментов, зависшем участнике команды или просит помочь с диагностикой AionUi.',
    'uk-UA':
      'Діагностика запущеної інсталяції AionUi: перевірка завислих або помилкових розмов, стану провайдера, стану запланованих завдань, стану MCP-серверів, стану учасників команди, стану бекенду та журналів aioncore. Використовуйте, коли користувач повідомляє про некоректну роботу AionUi, завислу розмову, збій виклику LLM/провайдера, невиконане заплановане завдання, MCP-сервер без інструментів, завислого учасника команди або просить допомогти з діагностикою AionUi.',
    'tr-TR':
      "Çalışan bir AionUi kurulumunu teşhis eder: takılmış veya hatalı sohbetleri inceler; sağlayıcı durumunu, zamanlanmış görev durumunu, MCP sunucu durumunu, ekip üyesi durumunu, arka uç durumunu ve aioncore günlüklerini kontrol eder. Kullanıcı AionUi'nin hatalı davrandığını, bir sohbetin takıldığını, bir LLM/sağlayıcı çağrısının başarısız olduğunu, zamanlanmış bir görevin çalışmadığını, bir MCP sunucusunun araç içermediğini, bir ekip üyesinin yanıt vermediğini bildirdiğinde veya AionUi sorun giderme istediğinde kullanın.",
    'fa-IR':
      'عیبیابی نصب در حال اجرای AionUi: بررسی گفتگوهای متوقف یا دارای خطا، وضعیت ارائهدهنده، وضعیت وظایف زمانبندیشده، وضعیت سرورهای MCP، وضعیت اعضای تیم، وضعیت بکاند و لاگهای aioncore. زمانی استفاده کنید که کاربر از رفتار نادرست AionUi، توقف یک گفتگو، شکست فراخوانی LLM/ارائهدهنده، اجرانشدن یک وظیفه زمانبندیشده، نبود ابزار در سرور MCP، پاسخندادن یکی از اعضای تیم خبر دهد یا درخواست عیبیابی AionUi کند.',
  },
  'aionui-webui-public': {
    'en-US':
      "Expose the user's local AionUi WebUI to the public internet with a near-zero-effort flow. Detects whether the WebUI is running, guides the user to switch it on if needed (the only manual step), self-installs cloudflared cross-platform, opens a Cloudflare quick tunnel, verifies the public URL actually works, then explains the limitations honestly (temporary/random URL, must stay running, password is the only protection, traffic transits Cloudflare). Use whenever the user wants to reach their AionUi from outside the LAN, over the internet, or share a public link. Distinct from aionui-webui-setup (which covers manual LAN / Tailscale / server config through the settings UI): this skill produces a one-click public link via an automatic tunnel.",
    'zh-CN':
      '用近乎零操作的方式将用户的本地 AionUi WebUI 暴露到公网。检测 WebUI 是否在运行，必要时引导用户开启（唯一的手动步骤），跨平台自动安装 cloudflared，开启 Cloudflare 快速隧道，验证公网地址确实可用，然后如实说明限制（临时/随机地址、必须保持运行、密码是唯一保护、流量经过 Cloudflare）。只要用户希望从局域网外、通过互联网访问 AionUi，或分享一个公网链接，就使用本技能。与 aionui-webui-setup（通过设置界面完成手动局域网 / Tailscale / 服务器配置）不同：本技能通过自动隧道一键生成公网链接。',
    'zh-TW':
      '用近乎零操作的方式將使用者的本機 AionUi WebUI 暴露到公網。偵測 WebUI 是否在執行，必要時引導使用者開啟（唯一的手動步驟），跨平台自動安裝 cloudflared，開啟 Cloudflare 快速隧道，驗證公網位址確實可用，然後如實說明限制（臨時/隨機位址、必須保持執行、密碼是唯一保護、流量經過 Cloudflare）。只要使用者希望從區域網路外、透過網際網路存取 AionUi，或分享公網連結，就使用本技能。與 aionui-webui-setup（透過設定介面完成手動 LAN / Tailscale / 伺服器設定）不同：本技能透過自動隧道一鍵產生公網連結。',
    'ja-JP':
      'ユーザーのローカルAionUi WebUIをほぼ手間なく公開インターネットに公開します。WebUIが起動しているか検出し、必要に応じて起動を案内（唯一の手動ステップ）、cloudflaredをクロスプラットフォームで自動インストールし、Cloudflareクイックトンネルを開き、公開URLが実際に機能することを確認してから、制限事項を正直に説明します（一時的/ランダムなURL、起動し続ける必要がある、パスワードが唯一の保護、トラフィックはCloudflareを経由）。ユーザーがLAN外からAionUiにアクセスしたい場合、インターネット経由で利用したい場合、または公開リンクを共有したい場合に使用します。aionui-webui-setup（設定UIから手動LAN / Tailscale / サーバー構成を扱う）とは異なり、本スキルは自動トンネルでワンクリックの公開リンクを生成します。',
    'ko-KR':
      '사용자의 로컬 AionUi WebUI를 거의 수고 없이 공개 인터넷에 노출합니다. WebUI가 실행 중인지 감지하고, 필요한 경우 켜도록 안내하며(유일한 수동 단계), cloudflared를 크로스 플랫폼으로 자동 설치하고, Cloudflare 퀵 터널을 열고, 공개 URL이 실제로 동작하는지 확인한 뒤 제한 사항을 정직하게 설명합니다(임시/무작위 URL, 계속 실행 중이어야 함, 비밀번호가 유일한 보호 수단, 트래픽은 Cloudflare를 경유). 사용자가 LAN 외부에서, 인터넷을 통해 AionUi에 접근하거나 공개 링크를 공유하려 할 때 사용합니다. aionui-webui-setup(설정 UI를 통한 수동 LAN / Tailscale / 서버 구성)과 달리, 이 스킬은 자동 터널로 원클릭 공개 링크를 만듭니다.',
    'de-DE':
      'Macht die lokale AionUi-WebUI des Benutzers mit minimalem Aufwand über das öffentliche Internet erreichbar. Erkennt, ob die WebUI läuft, führt den Benutzer bei Bedarf durch das Einschalten (der einzige manuelle Schritt), installiert cloudflared plattformübergreifend selbst, öffnet einen Cloudflare-Quick-Tunnel, verifiziert, dass die öffentliche URL tatsächlich funktioniert, und erklärt dann ehrlich die Einschränkungen (temporäre/zufällige URL, muss laufen bleiben, Passwort ist der einzige Schutz, Datenverkehr läuft über Cloudflare). Verwenden Sie dies, wenn der Benutzer von außerhalb des LAN, über das Internet auf AionUi zugreifen oder einen öffentlichen Link teilen möchte. Im Unterschied zu aionui-webui-setup (das manuelle LAN-/Tailscale-/Serverkonfiguration über die Einstellungen abdeckt) erzeugt dieser Skill einen Ein-Klick-Link über einen automatischen Tunnel.',
    'es-ES':
      'Expone la WebUI local de AionUi del usuario a la internet pública con un flujo de esfuerzo casi nulo. Detecta si la WebUI está en ejecución, guía al usuario para activarla si es necesario (el único paso manual), autoinstala cloudflared en todas las plataformas, abre un túnel rápido de Cloudflare, verifica que la URL pública funciona realmente y luego explica las limitaciones con honestidad (URL temporal/aleatoria, debe permanecer activa, la contraseña es la única protección, el tráfico pasa por Cloudflare). Úsalo siempre que el usuario quiera acceder a su AionUi desde fuera de la LAN, a través de internet, o compartir un enlace público. Se diferencia de aionui-webui-setup (que cubre la configuración manual de LAN/Tailscale/servidor a través de la interfaz de ajustes): este skill produce un enlace público de un clic mediante un túnel automático.',
    'fr-FR':
      'Expose l’interface WebUI locale d’AionUi de l’utilisateur sur l’internet public avec un effort quasi nul. Détecte si la WebUI est en cours d’exécution, guide l’utilisateur pour l’activer si nécessaire (la seule étape manuelle), installe automatiquement cloudflared sur toutes les plateformes, ouvre un tunnel rapide Cloudflare, vérifie que l’URL publique fonctionne réellement, puis explique honnêtement les limites (URL temporaire/aléatoire, doit rester active, le mot de passe est la seule protection, le trafic transite par Cloudflare). À utiliser chaque fois que l’utilisateur souhaite accéder à AionUi depuis l’extérieur du réseau local, via internet, ou partager un lien public. À distinguer d’aionui-webui-setup (qui couvre la configuration manuelle LAN / Tailscale / serveur via l’interface des paramètres) : ce skill produit un lien public en un clic via un tunnel automatique.',
    'pt-BR':
      'Expõe a WebUI local do AionUi do usuário à internet pública com um fluxo de esforço quase zero. Detecta se a WebUI está em execução, orienta o usuário a ativá-la se necessário (a única etapa manual), instala automaticamente o cloudflared em várias plataformas, abre um túnel rápido do Cloudflare, verifica se a URL pública realmente funciona e depois explica as limitações com honestidade (URL temporária/aleatória, precisa continuar em execução, a senha é a única proteção, o tráfego passa pelo Cloudflare). Use sempre que o usuário quiser acessar o AionUi fora da rede local, pela internet, ou compartilhar um link público. Diferente do aionui-webui-setup (que cobre configuração manual de LAN / Tailscale / servidor pela interface de configurações): este skill gera um link público com um clique via túnel automático.',
    'ru-RU':
      'Открывает доступ к локальному AionUi WebUI пользователя через публичный интернет почти без усилий. Определяет, запущен ли WebUI, при необходимости подсказывает включить его (единственный ручной шаг), автоматически устанавливает cloudflared на всех платформах, открывает быстрый туннель Cloudflare, проверяет, что публичный URL действительно работает, а затем честно объясняет ограничения (временный/случайный URL, должен оставаться запущенным, пароль — единственная защита, трафик проходит через Cloudflare). Используйте, когда пользователь хочет получить доступ к AionUi извне локальной сети, через интернет, или поделиться публичной ссылкой. В отличие от aionui-webui-setup (который охватывает ручную настройку LAN / Tailscale / сервера через интерфейс настроек), этот навык создаёт публичную ссылку в один клик через автоматический туннель.',
    'uk-UA':
      'Відкриває доступ до локального AionUi WebUI користувача через публічний інтернет майже без зусиль. Визначає, чи запущено WebUI, за потреби підказує увімкнути його (єдиний ручний крок), автоматично встановлює cloudflared на всіх платформах, відкриває швидкий тунель Cloudflare, перевіряє, що публічний URL справді працює, а потім чесно пояснює обмеження (тимчасовий/випадковий URL, має залишатися запущеним, пароль — єдиний захист, трафік проходить через Cloudflare). Використовуйте, коли користувач хоче отримати доступ до AionUi ззовні локальної мережі, через інтернет, або поділитися публічним посиланням. На відміну від aionui-webui-setup (який охоплює ручне налаштування LAN / Tailscale / сервера через інтерфейс налаштувань), цей скіл створює публічне посилання одним кліком через автоматичний тунель.',
    'tr-TR':
      "Kullanıcının yerel AionUi WebUI'sini neredeyse sıfır eforla genel internete açar. WebUI'nin çalışıp çalışmadığını algılar, gerekirse kullanıcıyı açmaya yönlendirir (tek elle yapılan adım), cloudflared'ı platformlar arası otomatik kurar, Cloudflare hızlı tüneli açar, genel URL'nin gerçekten çalıştığını doğrular ve ardından sınırlamaları dürüstçe açıklar (geçici/rastgele URL, açık kalmalıdır, parola tek korumadır, trafik Cloudflare üzerinden geçer). Kullanıcı AionUi'ye LAN dışından, internet üzerinden erişmek veya genel bir bağlantı paylaşmak istediğinde kullanın. aionui-webui-setup'tan (ayarlar arayüzü üzerinden manuel LAN / Tailscale / sunucu yapılandırmasını kapsar) farklıdır: bu beceri otomatik tünel ile tek tıkla genel bağlantı üretir.",
    'fa-IR':
      'WebUI محلی AionUi کاربر را با تقریباً صفر تلاش در اینترنت عمومی در دسترس قرار میدهد. تشخیص میدهد WebUI در حال اجراست یا نه، در صورت نیاز کاربر را به روشنکردن آن راهنمایی میکند (تنها مرحله دستی)، بهصورت خودکار cloudflared را در همه پلتفرمها نصب میکند، یک تونل سریع Cloudflare باز میکند، کارکرد واقعی URL عمومی را بررسی میکند و سپس محدودیتها را صادقانه توضیح میدهد (URL موقت/تصادفی، باید روشن بماند، رمز عبور تنها محافظت است، ترافیک از Cloudflare عبور میکند). هر زمان که کاربر بخواهد از خارج از شبکه محلی، از طریق اینترنت به AionUi دسترسی داشته باشد یا لینک عمومی به اشتراک بگذارد، استفاده کنید. تفاوت آن با aionui-webui-setup (که پیکربندی دستی LAN / Tailscale / سرور را از طریق رابط تنظیمات پوشش میدهد) این است که این اسکیل از طریق تونل خودکار یک لینک عمومی یککلیکی تولید میکند.',
  },
  'aionui-webui-setup': {
    'en-US':
      'AionUi WebUI configuration expert: Helps users configure AionUi WebUI mode for remote access through the settings interface. Supports LAN connection, Tailscale VPN, and server deployment. Use when users need to set up AionUi WebUI, configure remote access, troubleshoot WebUI issues, or deploy AionUi on servers.',
    'zh-CN':
      'AionUi WebUI 配置专家：帮助用户通过设置界面配置 AionUi WebUI 的远程访问模式。支持局域网连接、Tailscale VPN 和服务器部署。当用户需要设置 AionUi WebUI、配置远程访问、排查 WebUI 问题或在服务器上部署 AionUi 时使用。',
    'zh-TW':
      'AionUi WebUI 設定專家：幫助使用者透過設定介面設定 AionUi WebUI 的遠端存取模式。支援區域網路連線、Tailscale VPN 與伺服器部署。當使用者需要設定 AionUi WebUI、設定遠端存取、排除 WebUI 問題或在伺服器上部署 AionUi 時使用。',
    'ja-JP':
      'AionUi WebUI設定のエキスパート：設定インターフェースからAionUi WebUIのリモートアクセスモードを構成するユーザーを支援します。LAN接続、Tailscale VPN、サーバーデプロイに対応。ユーザーがAionUi WebUIのセットアップ、リモートアクセスの構成、WebUIの問題のトラブルシューティング、またはサーバーへのAionUiデプロイを必要とするときに使用します。',
    'ko-KR':
      'AionUi WebUI 구성 전문가: 설정 인터페이스를 통해 AionUi WebUI의 원격 액세스 모드를 구성하도록 사용자를 돕습니다. LAN 연결, Tailscale VPN, 서버 배포를 지원합니다. 사용자가 AionUi WebUI를 설정하거나, 원격 액세스를 구성하거나, WebUI 문제를 해결하거나, 서버에 AionUi를 배포해야 할 때 사용합니다.',
    'de-DE':
      'Experte für die AionUi-WebUI-Konfiguration: hilft Benutzern, den AionUi-WebUI-Modus für den Fernzugriff über die Einstellungen zu konfigurieren. Unterstützt LAN-Verbindung, Tailscale-VPN und Serverbereitstellung. Verwenden Sie dies, wenn Benutzer die AionUi-WebUI einrichten, Fernzugriff konfigurieren, WebUI-Probleme beheben oder AionUi auf Servern bereitstellen müssen.',
    'es-ES':
      'Experto en configuración de la WebUI de AionUi: ayuda a los usuarios a configurar el modo WebUI de AionUi para acceso remoto a través de la interfaz de ajustes. Admite conexión LAN, VPN Tailscale y despliegue en servidores. Úsalo cuando los usuarios necesiten configurar la WebUI de AionUi, ajustar el acceso remoto, resolver problemas de WebUI o desplegar AionUi en servidores.',
    'fr-FR':
      'Expert en configuration de la WebUI AionUi : aide les utilisateurs à configurer le mode WebUI d’AionUi pour un accès à distance via l’interface des paramètres. Prend en charge la connexion LAN, le VPN Tailscale et le déploiement sur serveur. À utiliser lorsque les utilisateurs doivent configurer la WebUI AionUi, paramétrer l’accès à distance, résoudre des problèmes de WebUI ou déployer AionUi sur des serveurs.',
    'pt-BR':
      'Especialista em configuração da WebUI do AionUi: ajuda os usuários a configurar o modo WebUI do AionUi para acesso remoto pela interface de configurações. Suporta conexão LAN, VPN Tailscale e implantação em servidores. Use quando os usuários precisarem configurar a WebUI do AionUi, ajustar o acesso remoto, solucionar problemas da WebUI ou implantar o AionUi em servidores.',
    'ru-RU':
      'Эксперт по настройке AionUi WebUI: помогает пользователям настраивать режим AionUi WebUI для удалённого доступа через интерфейс настроек. Поддерживает подключение по LAN, VPN Tailscale и развёртывание на сервере. Используйте, когда пользователям нужно настроить AionUi WebUI, организовать удалённый доступ, устранить проблемы с WebUI или развернуть AionUi на серверах.',
    'uk-UA':
      'Експерт із налаштування AionUi WebUI: допомагає користувачам налаштовувати режим AionUi WebUI для віддаленого доступу через інтерфейс налаштувань. Підтримує підключення через LAN, VPN Tailscale і розгортання на сервері. Використовуйте, коли користувачам потрібно налаштувати AionUi WebUI, організувати віддалений доступ, усунути проблеми з WebUI або розгорнути AionUi на серверах.',
    'tr-TR':
      "AionUi WebUI yapılandırma uzmanı: kullanıcıların ayarlar arayüzü aracılığıyla uzaktan erişim için AionUi WebUI modunu yapılandırmasına yardımcı olur. LAN bağlantısını, Tailscale VPN'i ve sunucu dağıtımını destekler. Kullanıcıların AionUi WebUI'yi kurması, uzaktan erişimi yapılandırması, WebUI sorunlarını gidermesi veya AionUi'yi sunuculara dağıtması gerektiğinde kullanın.",
    'fa-IR':
      'متخصص پیکربندی WebUI آئین‌یوآی: به کاربران کمک میکند حالت WebUI آئین‌یوآی را برای دسترسی از راه دور از طریق رابط تنظیمات پیکربندی کنند. از اتصال LAN، VPN تیل‌اسکیل و استقرار روی سرور پشتیبانی میکند. زمانی استفاده کنید که کاربران نیاز به راه‌اندازی WebUI آئین‌یوآی، پیکربندی دسترسی از راه دور، رفع مشکلات WebUI یا استقرار آئین‌یوآی روی سرورها دارند.',
  },
  mermaid: {
    'en-US':
      'Render Mermaid diagrams as SVG or ASCII art using beautiful-mermaid. Use when users need to create flowcharts, sequence diagrams, state diagrams, class diagrams, or ER diagrams. Supports both graphical SVG output and terminal-friendly ASCII/Unicode output.',
    'zh-CN':
      '使用 beautiful-mermaid 将 Mermaid 图表渲染为 SVG 或 ASCII 图形。当用户需要创建流程图、时序图、状态图、类图或 ER 图时使用。同时支持图形化 SVG 输出和适合终端的 ASCII/Unicode 输出。',
    'zh-TW':
      '使用 beautiful-mermaid 將 Mermaid 圖表轉換為 SVG 或 ASCII 圖形。當使用者需要建立流程圖、循序圖、狀態圖、類別圖或 ER 圖時使用。同時支援圖形化 SVG 輸出與適合終端機的 ASCII/Unicode 輸出。',
    'ja-JP':
      'beautiful-mermaidを使ってMermaid図をSVGまたはASCIIアートとしてレンダリングします。フローチャート、シーケンス図、状態図、クラス図、ER図を作成する必要がある場合に使用します。グラフィカルなSVG出力と、ターミナル向けのASCII/Unicode出力の両方をサポートします。',
    'ko-KR':
      'beautiful-mermaid를 사용해 Mermaid 다이어그램을 SVG 또는 ASCII 아트로 렌더링합니다. 사용자가 순서도, 시퀀스 다이어그램, 상태 다이어그램, 클래스 다이어그램 또는 ER 다이어그램을 만들어야 할 때 사용합니다. 그래픽 SVG 출력과 터미널 친화적인 ASCII/Unicode 출력을 모두 지원합니다.',
    'de-DE':
      'Rendert Mermaid-Diagramme als SVG oder ASCII-Kunst mit beautiful-mermaid. Verwenden Sie dies, wenn Benutzer Flussdiagramme, Sequenzdiagramme, Zustandsdiagramme, Klassendiagramme oder ER-Diagramme erstellen müssen. Unterstützt sowohl grafische SVG-Ausgabe als auch terminalfreundliche ASCII/Unicode-Ausgabe.',
    'es-ES':
      'Renderiza diagramas Mermaid como SVG o arte ASCII usando beautiful-mermaid. Úsalo cuando los usuarios necesiten crear diagramas de flujo, diagramas de secuencia, diagramas de estado, diagramas de clases o diagramas ER. Admite tanto salida gráfica SVG como salida ASCII/Unicode apta para terminal.',
    'fr-FR':
      'Rend les diagrammes Mermaid en SVG ou en art ASCII grâce à beautiful-mermaid. À utiliser lorsque les utilisateurs doivent créer des organigrammes, des diagrammes de séquence, des diagrammes d’état, des diagrammes de classes ou des diagrammes ER. Prend en charge à la fois la sortie graphique SVG et la sortie ASCII/Unicode adaptée au terminal.',
    'pt-BR':
      'Renderiza diagramas Mermaid como SVG ou arte ASCII usando beautiful-mermaid. Use quando os usuários precisarem criar fluxogramas, diagramas de sequência, diagramas de estado, diagramas de classe ou diagramas ER. Suporta tanto saída gráfica SVG quanto saída ASCII/Unicode amigável ao terminal.',
    'ru-RU':
      'Рендеринг диаграмм Mermaid в формате SVG или ASCII-графики с помощью beautiful-mermaid. Используйте, когда пользователям нужно создавать блок-схемы, диаграммы последовательности, диаграммы состояний, диаграммы классов или ER-диаграммы. Поддерживает как графический вывод в SVG, так и удобный для терминала вывод в ASCII/Unicode.',
    'uk-UA':
      'Рендеринг діаграм Mermaid у форматі SVG або ASCII-графіки за допомогою beautiful-mermaid. Використовуйте, коли користувачам потрібно створювати блок-схеми, діаграми послідовності, діаграми станів, діаграми класів або ER-діаграми. Підтримує як графічний вивід у SVG, так і зручний для терміналу вивід у ASCII/Unicode.',
    'tr-TR':
      'beautiful-mermaid kullanarak Mermaid diyagramlarını SVG veya ASCII sanatı olarak oluşturur. Kullanıcıların akış şeması, sıralı diyagram, durum diyagramı, sınıf diyagramı veya ER diyagramı oluşturması gerektiğinde kullanın. Hem grafik SVG çıktısını hem de terminale uygun ASCII/Unicode çıktısını destekler.',
    'fa-IR':
      'با استفاده از beautiful-mermaid نمودارهای Mermaid را بهصورت SVG یا هنر ASCII رندر میکند. زمانی استفاده کنید که کاربران نیاز به ایجاد فلوچارت، نمودار توالی، نمودار حالت، نمودار کلاس یا نمودار ER دارند. هم خروجی گرافیکی SVG و هم خروجی ASCII/Unicode سازگار با ترمینال را پشتیبانی میکند.',
  },
  moltbook: {
    'en-US': 'The social network for AI agents. Post, comment, upvote, and create communities.',
    'zh-CN': '面向 AI 智能体的社交网络。支持发帖、评论、点赞和创建社区。',
    'zh-TW': '面向 AI 智慧體的社交網路。支援發文、留言、按讚和建立社群。',
    'ja-JP': 'AIエージェントのためのソーシャルネットワーク。投稿、コメント、アップボート、コミュニティ作成ができます。',
    'ko-KR': 'AI 에이전트를 위한 소셜 네트워크입니다. 게시, 댓글, 추천, 커뮤니티 생성이 가능합니다.',
    'de-DE':
      'Das soziale Netzwerk für KI-Agenten. Beiträge verfassen, kommentieren, hochvoten und Communities erstellen.',
    'es-ES': 'La red social para agentes de IA. Publica, comenta, vota a favor y crea comunidades.',
    'fr-FR': 'Le réseau social des agents IA. Publiez, commentez, votez et créez des communautés.',
    'pt-BR': 'A rede social para agentes de IA. Publique, comente, curta e crie comunidades.',
    'ru-RU': 'Социальная сеть для ИИ-агентов. Публикуйте, комментируйте, голосуйте и создавайте сообщества.',
    'uk-UA': 'Соціальна мережа для ІІ-агентів. Публікуйте, коментуйте, голосуйте та створюйте спільноти.',
    'tr-TR': 'Yapay zekâ ajanları için sosyal ağ. Gönderi paylaşın, yorum yapın, oylayın ve topluluklar oluşturun.',
    'fa-IR': 'شبکه اجتماعی برای عامل‌های هوش مصنوعی. پست‌گذاری، نظر، رأی مثبت و ایجاد انجمن.',
  },
  'morph-ppt-3d': {
    'en-US':
      '3D Morph PPT — extends morph-ppt with GLB model insertion, cinematographic camera, model-content layout, and enriched visual design system.',
    'zh-CN': '3D Morph PPT——在 morph-ppt 基础上扩展 GLB 模型插入、电影级镜头、模型内容排版和更丰富的视觉设计体系。',
    'zh-TW': '3D Morph PPT——在 morph-ppt 的基礎上擴展 GLB 模型插入、電影級鏡頭、模型內容排版與更豐富的視覺設計體系。',
    'ja-JP':
      '3D Morph PPT — morph-pptを拡張し、GLBモデルの挿入、映画的なカメラワーク、モデルコンテンツのレイアウト、強化されたビジュアルデザインシステムを提供します。',
    'ko-KR':
      '3D Morph PPT — morph-ppt를 확장하여 GLB 모델 삽입, 영화적인 카메라 워크, 모델 콘텐츠 레이아웃, 강화된 시각 디자인 시스템을 제공합니다.',
    'de-DE':
      '3D Morph PPT — erweitert morph-ppt um GLB-Modelleinfügung, filmische Kameraführung, Modell-Content-Layout und ein erweitertes visuelles Designsystem.',
    'es-ES':
      '3D Morph PPT: amplía morph-ppt con inserción de modelos GLB, cámara cinematográfica, composición de contenido con modelos y un sistema de diseño visual enriquecido.',
    'fr-FR':
      '3D Morph PPT — étend morph-ppt avec l’insertion de modèles GLB, une caméra cinématographique, une mise en page de contenu avec modèles et un système de design visuel enrichi.',
    'pt-BR':
      '3D Morph PPT — estende o morph-ppt com inserção de modelos GLB, câmera cinematográfica, layout de conteúdo com modelos e um sistema de design visual enriquecido.',
    'ru-RU':
      '3D Morph PPT — расширяет morph-ppt вставкой GLB-моделей, кинематографической камерой, компоновкой содержимого вокруг моделей и обогащённой системой визуального дизайна.',
    'uk-UA':
      '3D Morph PPT — розширює morph-ppt вставкою GLB-моделей, кінематографічною камерою, компонуванням вмісту навколо моделей і збагаченою системою візуального дизайну.',
    'tr-TR':
      "3D Morph PPT — morph-ppt'yi GLB model ekleme, sinematik kamera, model içerik düzeni ve zenginleştirilmiş görsel tasarım sistemiyle genişletir.",
    'fa-IR':
      '3D Morph PPT — افزونهای بر morph-ppt با درج مدلهای GLB، دوربین سینمایی، چیدمان محتوای مدلمحور و سیستم طراحی بصری غنیشده.',
  },
  'morph-ppt': {
    'en-US':
      'Use this skill when the user wants a .pptx with smooth cross-slide animation — PowerPoint Morph transitions, Keynote-style continuous motion, shapes that grow / move / rotate as the slide advances. Trigger on: "morph", "morph transition", "smooth transition", "continuous animation across slides", "Keynote-style transition", "animated slide sequence", "shape continuity across slides". Output is a single .pptx. This skill is a scene layer on top of officecli-pptx — inherits every pptx v2 rule (visual floor, grid, palettes, connector canon, Delivery Gate 1–5a). DO NOT invoke for a generic deck, pitch deck, or board review without cross-slide motion — route those to officecli-pptx base or officecli-pitch-deck.',
    'zh-CN':
      '当用户需要带平滑跨页动画的 .pptx 时使用本技能——PowerPoint 变形（Morph）过渡、Keynote 式连续动效、形状随幻灯片推进而生长/移动/旋转。触发词包括："变形"、"变形过渡"、"平滑过渡"、"跨页连续动画"、"Keynote 式过渡"、"动画幻灯片序列"、"跨页形状连贯"。输出为单个 .pptx 文件。本技能是 officecli-pptx 之上的场景层——继承全部 pptx v2 规则（视觉下限、网格、调色板、连线规范、交付关卡 1–5a）。没有跨页动效的普通演示文稿、融资路演或董事会汇报不要调用——请转交 officecli-pptx 基础版或 officecli-pitch-deck。',
    'zh-TW':
      '當使用者需要帶平滑跨頁動畫的 .pptx 時使用本技能——PowerPoint 變形（Morph）轉場、Keynote 式連續動效、形狀隨投影片推進而生長/移動/旋轉。觸發詞包括："變形"、"變形轉場"、"平滑轉場"、"跨頁連續動畫"、"Keynote 式轉場"、"動畫投影片序列"、"跨頁形狀連貫"。輸出為單一 .pptx 檔案。本技能是 officecli-pptx 之上的場景層——繼承全部 pptx v2 規則（視覺下限、格線、調色盤、連線規範、交付關卡 1–5a）。沒有跨頁動效的普通簡報、融資路演或董事會彙報請勿呼叫——請轉交 officecli-pptx 基礎版或 officecli-pitch-deck。',
    'ja-JP':
      'ユーザーがスライド間のスムーズなアニメーションを持つ.pptxを望む場合に使用します — PowerPointのMorphトランジション、Keynote風の連続モーション、スライドが進むにつれて拡大・移動・回転する図形。トリガー："モーフ"、"モーフトランジション"、"スムーズなトランジション"、"スライド間の連続アニメーション"、"Keynote風トランジション"、"アニメーションスライドシーケンス"、"スライド間の図形の連続性"。出力は単一の.pptxです。本スキルはofficecli-pptxの上位にあるシーン層で、すべてのpptx v2ルール（ビジュアル下限、グリッド、パレット、コネクタ規範、デリバリーゲート1–5a）を継承します。スライド間モーションのない一般的なデッキ、ピッチデッキ、取締役会レビューには使用しないでください — それらはofficecli-pptx基本版またはofficecli-pitch-deckに振り分けてください。',
    'ko-KR':
      '사용자가 슬라이드 간 부드러운 애니메이션이 있는 .pptx를 원할 때 사용합니다 — PowerPoint Morph 전환, Keynote 스타일의 연속 모션, 슬라이드가 진행됨에 따라 커지거나 이동·회전하는 도형. 트리거: "morph", "morph 전환", "부드러운 전환", "슬라이드 간 연속 애니메이션", "Keynote 스타일 전환", "애니메이션 슬라이드 시퀀스", "슬라이드 간 도형 연속성". 출력은 단일 .pptx입니다. 이 스킬은 officecli-pptx 위의 씬 레이어로 모든 pptx v2 규칙(비주얼 바닥, 그리드, 팔레트, 커넥터 규범, 전달 게이트 1–5a)을 상속합니다. 슬라이드 간 모션이 없는 일반 덱, 피치 덱, 이사회 리뷰에는 호출하지 마세요 — officecli-pptx 기본 또는 officecli-pitch-deck으로 안내하세요.',
    'de-DE':
      'Verwenden Sie diesen Skill, wenn der Benutzer eine .pptx mit sanften Übergängen zwischen Folien wünscht — PowerPoint-Morph-Übergänge, Keynote-artige kontinuierliche Bewegungen, Formen, die beim Fortschreiten der Folie wachsen / sich bewegen / drehen. Auslöser: "Morph", "Morph-Übergang", "sanfter Übergang", "kontinuierliche Animation über Folien", "Keynote-artiger Übergang", "animierte Folienabfolge", "Formenkontinuität über Folien". Ausgabe ist eine einzelne .pptx. Dieser Skill ist eine Szenenebene über officecli-pptx — er erbt alle pptx-v2-Regeln (visuelle Untergrenze, Raster, Paletten, Connector-Kanon, Delivery Gate 1–5a). NICHT für generische Decks, Pitch-Decks oder Vorstandsreviews ohne folienübergreifende Bewegung verwenden — leiten Sie diese an officecli-pptx oder officecli-pitch-deck weiter.',
    'es-ES':
      'Usa este skill cuando el usuario quiera un .pptx con animación fluida entre diapositivas: transiciones Morph de PowerPoint, movimiento continuo estilo Keynote, formas que crecen / se mueven / rotan al avanzar la diapositiva. Disparadores: "morph", "transición morph", "transición suave", "animación continua entre diapositivas", "transición estilo Keynote", "secuencia de diapositivas animadas", "continuidad de formas entre diapositivas". La salida es un único .pptx. Este skill es una capa de escena sobre officecli-pptx: hereda todas las reglas v2 de pptx (nivel visual mínimo, cuadrícula, paletas, canon de conectores, Delivery Gate 1–5a). NO lo invoques para presentaciones genéricas, pitch decks o revisiones de directorio sin movimiento entre diapositivas: dirígelos a officecli-pptx base u officecli-pitch-deck.',
    'fr-FR':
      'Utilisez ce skill lorsque l’utilisateur souhaite un .pptx avec une animation fluide entre les diapositives — transitions Morph de PowerPoint, mouvement continu façon Keynote, formes qui grandissent / bougent / pivotent au fil des diapositives. Déclencheurs : « morph », « transition morph », « transition fluide », « animation continue entre diapositives », « transition façon Keynote », « séquence de diapositives animées », « continuité des formes entre diapositives ». Sortie : un seul .pptx. Ce skill est une couche de scène au-dessus d’officecli-pptx — il hérite de toutes les règles pptx v2 (plancher visuel, grille, palettes, canon des connecteurs, Delivery Gate 1–5a). NE PAS l’invoquer pour un deck générique, un pitch deck ou une revue de conseil sans mouvement inter-diapositives — orientez-les vers officecli-pptx de base ou officecli-pitch-deck.',
    'pt-BR':
      'Use este skill quando o usuário quiser um .pptx com animação suave entre slides — transições Morph do PowerPoint, movimento contínuo estilo Keynote, formas que crescem / movem / giram conforme o slide avança. Gatilhos: "morph", "transição morph", "transição suave", "animação contínua entre slides", "transição estilo Keynote", "sequência de slides animados", "continuidade de formas entre slides". A saída é um único .pptx. Este skill é uma camada de cena sobre o officecli-pptx — herda todas as regras v2 do pptx (piso visual, grade, paletas, cânon de conectores, Delivery Gate 1–5a). NÃO invoque para decks genéricos, pitch decks ou revisões de diretoria sem movimento entre slides — direcione-os ao officecli-pptx base ou officecli-pitch-deck.',
    'ru-RU':
      'Используйте этот навык, когда пользователю нужен .pptx с плавной межслайдовой анимацией — переходы Morph в PowerPoint, непрерывное движение в стиле Keynote, фигуры, которые растут / движутся / вращаются при смене слайдов. Триггеры: «морф», «переход Morph», «плавный переход», «непрерывная анимация между слайдами», «переход в стиле Keynote», «анимированная последовательность слайдов», «непрерывность фигур между слайдами». Результат — один .pptx. Этот навык является сценарным слоем поверх officecli-pptx — наследует все правила pptx v2 (визуальный минимум, сетка, палитры, канон соединителей, Delivery Gate 1–5a). НЕ вызывайте для обычных презентаций, питч-деков или обзоров для совета директоров без межслайдовой анимации — направляйте их на базовый officecli-pptx или officecli-pitch-deck.',
    'uk-UA':
      'Використовуйте цей скіл, коли користувачу потрібен .pptx із плавною міжслайдовою анімацією — переходи Morph у PowerPoint, безперервний рух у стилі Keynote, фігури, які ростуть / рухаються / обертаються зі зміною слайдів. Тригери: «морф», «перехід Morph», «плавний перехід», «безперервна анімація між слайдами», «перехід у стилі Keynote», «анімована послідовність слайдів», «безперервність фігур між слайдами». Результат — один .pptx. Цей скіл є сценарним шаром поверх officecli-pptx — успадковує всі правила pptx v2 (візуальний мінімум, сітка, палітри, канон з’єднувачів, Delivery Gate 1–5a). НЕ викликайте для звичайних презентацій, пітч-деків або оглядів для ради директорів без міжслайдової анімації — спрямовуйте їх на базовий officecli-pptx або officecli-pitch-deck.',
    'tr-TR':
      'Kullanıcı slaytlar arası yumuşak animasyonlu bir .pptx istediğinde bu beceriyi kullanın — PowerPoint Morph geçişleri, Keynote tarzı kesintisiz hareket, slayt ilerledikçe büyüyen / hareket eden / dönen şekiller. Tetikleyiciler: "morph", "morph geçişi", "yumuşak geçiş", "slaytlar arası sürekli animasyon", "Keynote tarzı geçiş", "animasyonlu slayt dizisi", "slaytlar arası şekil sürekliliği". Çıktı tek bir .pptx dosyasıdır. Bu beceri officecli-pptx\'in üzerinde bir sahne katmanıdır — tüm pptx v2 kurallarını (görsel taban, ızgara, paletler, bağlayıcı kuralları, Teslim Kapısı 1–5a) devralır. Slaytlar arası hareket olmayan genel sunumlar, yatırımcı sunumları veya yönetim kurulu değerlendirmeleri için çağırmayın — bunları officecli-pptx tabanına veya officecli-pitch-deck\'e yönlendirin.',
    'fa-IR':
      'زمانی استفاده کنید که کاربر یک فایل .pptx با انیمیشن نرم بین اسلایدها میخواهد — انتقالهای Morph پاورپوینت، حرکت پیوسته به سبک Keynote، شکلهایی که با پیشروی اسلاید بزرگ میشوند/حرکت میکنند/میچرخند. محرکها: «morph»، «انتقال morph»، «انتقال نرم»، «انیمیشن پیوسته بین اسلایدها»، «انتقال به سبک Keynote»، «توالی اسلاید متحرک»، «پیوستگی شکل بین اسلایدها». خروجی یک فایل .pptx است. این اسکیل یک لایه صحنه بر روی officecli-pptx است — همه قوانین pptx v2 (کف بصری، شبکه، پالتها، قانون اتصالدهندهها، دروازه تحویل 1–5a) را به ارث میبرد. برای ارائههای معمولی، پیتچدک یا بررسی هیئتمدیره بدون حرکت بین اسلایدها فراخوانی نکنید — آنها را به officecli-pptx پایه یا officecli-pitch-deck هدایت کنید.',
  },
  'officecli-academic-paper': {
    'en-US':
      'Use this skill to build academic-style .docx output: journal / conference / thesis chapters carrying formal citation style (APA, Chicago, IEEE, MLA), numbered equations, figure & table cross-references, footnotes/endnotes, bibliography, or multi-column journal layout. Trigger on: "research paper", "journal paper", "conference paper", "manuscript", "thesis", "APA", "MLA", "Chicago", "IEEE two-column", "bibliography", "hanging indent", "citation style", "abstract + keywords", "equation numbering", "cross-reference", paper with footnotes/endnotes. Output is a single .docx.',
    'zh-CN':
      '使用本技能生成学术风格的 .docx 文档：期刊/会议/学位论文章节，带正式引文格式（APA、Chicago、IEEE、MLA）、编号公式、图表交叉引用、脚注/尾注、参考文献或期刊双栏版式。触发词包括："研究论文"、"期刊论文"、"会议论文"、"手稿"、"学位论文"、"APA"、"MLA"、"Chicago"、"IEEE 双栏"、"参考文献"、"悬挂缩进"、"引文格式"、"摘要+关键词"、"公式编号"、"交叉引用"、"带脚注/尾注的论文"。输出为单个 .docx 文件。',
    'zh-TW':
      '使用本技能產生學術風格的 .docx 文件：期刊/會議/學位論文章節，帶正式引用格式（APA、Chicago、IEEE、MLA）、編號公式、圖表交叉引用、註腳/尾註、參考文獻或期刊雙欄版面。觸發詞包括："研究論文"、"期刊論文"、"會議論文"、"手稿"、"學位論文"、"APA"、"MLA"、"Chicago"、"IEEE 雙欄"、"參考文獻"、"懸掛縮排"、"引用格式"、"摘要+關鍵字"、"公式編號"、"交叉引用"、"帶註腳/尾註的論文"。輸出為單一 .docx 檔案。',
    'ja-JP':
      '学術スタイルの.docx出力を生成するために使用します：ジャーナル/学会/学位論文の章、正式な引用スタイル（APA、Chicago、IEEE、MLA）、番号付き数式、図表の相互参照、脚注/文末注、参考文献、または多段組のジャーナルレイアウト。トリガー：「研究論文」、「ジャーナル論文」、「学会論文」、「草稿」、「学位論文」、「APA」、「MLA」、「Chicago」、「IEEE二段組」、「参考文献」、「ぶら下がりインデント」、「引用スタイル」、「要旨+キーワード」、「数式番号」、「相互参照」、「脚注/文末注付きの論文」。出力は単一の.docxです。',
    'ko-KR':
      '학술 스타일의 .docx 출력을 만들 때 사용합니다: 공식 인용 스타일(APA, Chicago, IEEE, MLA)을 갖춘 저널/학술대회/학위논문 챕터, 번호 매겨진 수식, 그림·표 교차 참조, 각주/미주, 참고문헌 또는 다단 저널 레이아웃. 트리거: "연구 논문", "저널 논문", "학술대회 논문", "원고", "학위 논문", "APA", "MLA", "Chicago", "IEEE 2단", "참고문헌", "내어쓰기", "인용 스타일", "초록+키워드", "수식 번호", "교차 참조", "각주/미주가 있는 논문". 출력은 단일 .docx입니다.',
    'de-DE':
      'Verwenden Sie diesen Skill für akademische .docx-Ausgabe: Journal-/Konferenz-/Abschlussarbeitskapitel mit formalem Zitierstil (APA, Chicago, IEEE, MLA), nummerierten Gleichungen, Querverweisen für Abbildungen und Tabellen, Fuß-/Endnoten, Bibliografie oder mehrspaltigem Journal-Layout. Auslöser: "Forschungsarbeit", "Journal-Artikel", "Konferenzbeitrag", "Manuskript", "Abschlussarbeit", "APA", "MLA", "Chicago", "IEEE zweispaltig", "Bibliografie", "hängender Einzug", "Zitierstil", "Abstract + Keywords", "Gleichungsnummerierung", "Querverweis", "Arbeit mit Fuß-/Endnoten". Ausgabe ist eine einzelne .docx.',
    'es-ES':
      'Usa este skill para generar salida .docx de estilo académico: capítulos de revista / conferencia / tesis con estilo de citación formal (APA, Chicago, IEEE, MLA), ecuaciones numeradas, referencias cruzadas de figuras y tablas, notas al pie / al final, bibliografía o maquetación de revista a varias columnas. Disparadores: "artículo de investigación", "artículo de revista", "artículo de conferencia", "manuscrito", "tesis", "APA", "MLA", "Chicago", "IEEE a dos columnas", "bibliografía", "sangría francesa", "estilo de citación", "resumen + palabras clave", "numeración de ecuaciones", "referencia cruzada", "artículo con notas al pie/final". La salida es un único .docx.',
    'fr-FR':
      'Utilisez ce skill pour produire un .docx de style académique : chapitres de revue / conférence / thèse avec style de citation formel (APA, Chicago, IEEE, MLA), équations numérotées, renvois croisés figures & tableaux, notes de bas de page / notes de fin, bibliographie ou mise en page de revue sur plusieurs colonnes. Déclencheurs : « article de recherche », « article de revue », « article de conférence », « manuscrit », « thèse », « APA », « MLA », « Chicago », « IEEE deux colonnes », « bibliographie », « retrait suspendu », « style de citation », « résumé + mots-clés », « numérotation des équations », « renvoi croisé », « article avec notes de bas de page / de fin ». Sortie : un seul .docx.',
    'pt-BR':
      'Use este skill para gerar saída .docx de estilo acadêmico: capítulos de periódico / conferência / tese com estilo de citação formal (APA, Chicago, IEEE, MLA), equações numeradas, referências cruzadas de figuras e tabelas, notas de rodapé / fim, bibliografia ou layout de periódico em várias colunas. Gatilhos: "artigo de pesquisa", "artigo de periódico", "artigo de conferência", "manuscrito", "tese", "APA", "MLA", "Chicago", "IEEE duas colunas", "bibliografia", "recuo deslocado", "estilo de citação", "resumo + palavras-chave", "numeração de equações", "referência cruzada", "artigo com notas de rodapé/fim". A saída é um único .docx.',
    'ru-RU':
      'Используйте этот навык для создания академического .docx: главы журнальных / конференционных / диссертационных работ с формальным стилем цитирования (APA, Chicago, IEEE, MLA), нумерованные уравнения, перекрёстные ссылки на рисунки и таблицы, сноски/концевые сноски, библиография или многоколоночная журнальная вёрстка. Триггеры: «научная статья», «журнальная статья», «конференционный доклад», «рукопись», «диссертация», «APA», «MLA», «Chicago», «IEEE в две колонки», «библиография», «висячий отступ», «стиль цитирования», «аннотация + ключевые слова», «нумерация уравнений», «перекрёстная ссылка», «статья со сносками/концевыми сносками». Результат — один .docx.',
    'uk-UA':
      'Використовуйте цей скіл для створення академічного .docx: розділи журнальних / конференційних / дисертаційних робіт із формальним стилем цитування (APA, Chicago, IEEE, MLA), нумеровані рівняння, перехресні посилання на рисунки й таблиці, виноски/кінцеві виноски, бібліографія або багатоколонкова журнальна верстка. Тригери: «наукова стаття», «журнальна стаття», «конференційна доповідь», «рукопис», «дисертація», «APA», «MLA», «Chicago», «IEEE у дві колонки», «бібліографія», «висячий відступ», «стиль цитування», «анотація + ключові слова», «нумерація рівнянь», «перехресне посилання», «стаття з виносками/кінцевими виносками». Результат — один .docx.',
    'tr-TR':
      'Akademik tarzda .docx çıktısı oluşturmak için bu beceriyi kullanın: resmi atıf stili (APA, Chicago, IEEE, MLA) taşıyan dergi / konferans / tez bölümleri, numaralı denklemler, şekil ve tablo çapraz referansları, dipnotlar/son notlar, kaynakça veya çok sütunlu dergi düzeni. Tetikleyiciler: "araştırma makalesi", "dergi makalesi", "konferans makalesi", "el yazması", "tez", "APA", "MLA", "Chicago", "IEEE iki sütun", "kaynakça", "asılı girinti", "atıf stili", "özet + anahtar kelimeler", "denklem numaralandırma", "çapraz referans", "dipnotlu/son notlu makale". Çıktı tek bir .docx dosyasıdır.',
    'fa-IR':
      'برای ساخت خروجی .docx با سبک آکادمیک استفاده کنید: فصلهای مجله/کنفرانس/پایاننامه با سبک استناد رسمی (APA، Chicago، IEEE، MLA)، معادلات شمارهدار، ارجاع متقابل شکل و جدول، پانویس/یادداشت پایانی، کتابشناسی یا چیدمان چندستونه مجله. محرکها: «مقاله پژوهشی»، «مقاله مجله»، «مقاله کنفرانس»، «دستنویس»، «پایاننامه»، «APA»، «MLA»، «Chicago»، «IEEE دوستونه»، «کتابشناسی»، «تورفتگی آویزان»، «سبک استناد»، «چکیده + کلیدواژهها»، «شمارهگذاری معادلات»، «ارجاع متقابل»، «مقاله با پانویس/یادداشت پایانی». خروجی یک فایل .docx است.',
  },
  'officecli-data-dashboard': {
    'en-US':
      'Use this skill to build a multi-element Excel dashboard — Dashboard sheet on open, multiple formula-driven KPI cards, multiple charts, sparklines, and conditional formatting — from CSV or tabular input. Trigger on: "dashboard", "KPI dashboard", "analytics dashboard", "executive dashboard", "metrics dashboard", "CSV to dashboard", "data visualization". Output is a single .xlsx. Scene-layer on officecli-xlsx: inherits every xlsx hard rule. DO NOT invoke for: a single budget tracker / one-sheet CSV-with-formatting (use xlsx), a 3-statement / DCF / LBO financial model (use financial-model), a weekly report with ≤ 1 chart and < 10 rows (use xlsx).',
    'zh-CN':
      '使用本技能从 CSV 或表格数据构建多元素 Excel 仪表盘——打开即见仪表盘工作表、多张公式驱动的 KPI 卡片、多个图表、迷你图和条件格式。触发词包括："仪表盘"、"KPI 仪表盘"、"分析仪表盘"、"高管仪表盘"、"指标仪表盘"、"CSV 转仪表盘"、"数据可视化"。输出为单个 .xlsx 文件。本技能是 officecli-xlsx 的场景层——继承全部 xlsx 硬性规则。以下情况不要调用：单个预算追踪表 / 单表带格式的 CSV（用 xlsx）、三表 / DCF / LBO 财务模型（用 financial-model）、图表不超过 1 个且行数少于 10 行的周报（用 xlsx）。',
    'zh-TW':
      '使用本技能從 CSV 或表格資料建構多元素 Excel 儀表板——開啟即見儀表板工作表、多張公式驅動的 KPI 卡片、多個圖表、迷你圖與條件格式。觸發詞包括："儀表板"、"KPI 儀表板"、"分析儀表板"、"主管儀表板"、"指標儀表板"、"CSV 轉儀表板"、"資料視覺化"。輸出為單一 .xlsx 檔案。本技能是 officecli-xlsx 的場景層——繼承全部 xlsx 硬性規則。以下情況請勿呼叫：單一預算追蹤表 / 單表帶格式的 CSV（用 xlsx）、三表 / DCF / LBO 財務模型（用 financial-model）、圖表不超過 1 個且列數少於 10 的週報（用 xlsx）。',
    'ja-JP':
      'CSVまたは表形式の入力から、複数要素のExcelダッシュボード — 開いたときのダッシュボードシート、複数の数式駆動KPIカード、複数のチャート、スパークライン、条件付き書式 — を構築するために使用します。トリガー：「ダッシュボード」、「KPIダッシュボード」、「分析ダッシュボード」、「役員向けダッシュボード」、「メトリクスダッシュボード」、「CSVからダッシュボード」、「データ可視化」。出力は単一の.xlsxです。officecli-xlsxのシーン層で、すべてのxlsxの厳格なルールを継承します。以下の場合は使用しないでください：単一の予算トラッカー / 書式付きCSVの単一シート（xlsxを使用）、三表/DCF/LBO財務モデル（financial-modelを使用）、チャート1つ以下かつ10行未満の週次レポート（xlsxを使用）。',
    'ko-KR':
      'CSV 또는 표 형식 입력에서 다중 요소 Excel 대시보드를 만들 때 사용합니다 — 열면 바로 보이는 대시보드 시트, 여러 수식 기반 KPI 카드, 여러 차트, 스파크라인, 조건부 서식. 트리거: "대시보드", "KPI 대시보드", "분석 대시보드", "임원용 대시보드", "지표 대시보드", "CSV를 대시보드로", "데이터 시각화". 출력은 단일 .xlsx입니다. officecli-xlsx의 씬 레이어로 모든 xlsx 하드 규칙을 상속합니다. 다음에는 호출하지 마세요: 단일 예산 추적기 / 서식 있는 단일 시트 CSV(xlsx 사용), 3재무제표 / DCF / LBO 금융 모델(financial-model 사용), 차트 1개 이하이고 10행 미만인 주간 보고서(xlsx 사용).',
    'de-DE':
      'Verwenden Sie diesen Skill, um ein mehrteiliges Excel-Dashboard zu erstellen — Dashboard-Blatt beim Öffnen, mehrere formelgesteuerte KPI-Karten, mehrere Diagramme, Sparklines und bedingte Formatierung — aus CSV- oder Tabelleneingaben. Auslöser: "Dashboard", "KPI-Dashboard", "Analyse-Dashboard", "Management-Dashboard", "Kennzahlen-Dashboard", "CSV zu Dashboard", "Datenvisualisierung". Ausgabe ist eine einzelne .xlsx. Szenenebene über officecli-xlsx: erbt alle xlsx-Hard-Regeln. NICHT verwenden für: einen einzelnen Budget-Tracker / einseitiges CSV mit Formatierung (xlsx verwenden), ein Drei-Statement-/DCF-/LBO-Finanzmodell (financial-model verwenden), einen Wochenbericht mit ≤ 1 Diagramm und < 10 Zeilen (xlsx verwenden).',
    'es-ES':
      'Usa este skill para construir un dashboard de Excel con múltiples elementos — hoja de dashboard al abrir, múltiples tarjetas KPI basadas en fórmulas, varios gráficos, minigráficos y formato condicional — a partir de CSV o datos tabulares. Disparadores: "dashboard", "dashboard de KPI", "dashboard de análisis", "dashboard ejecutivo", "dashboard de métricas", "CSV a dashboard", "visualización de datos". La salida es un único .xlsx. Capa de escena sobre officecli-xlsx: hereda todas las reglas estrictas de xlsx. NO lo invoques para: un único rastreador de presupuesto / CSV de una hoja con formato (usa xlsx), un modelo financiero de 3 estados / DCF / LBO (usa financial-model), un informe semanal con ≤ 1 gráfico y < 10 filas (usa xlsx).',
    'fr-FR':
      'Utilisez ce skill pour construire un tableau de bord Excel multi-éléments — feuille de tableau de bord à l’ouverture, plusieurs cartes KPI pilotées par formules, plusieurs graphiques, sparklines et mise en forme conditionnelle — à partir d’une entrée CSV ou tabulaire. Déclencheurs : « tableau de bord », « tableau de bord KPI », « tableau de bord analytique », « tableau de bord direction », « tableau de bord de métriques », « CSV vers tableau de bord », « visualisation de données ». Sortie : un seul .xlsx. Couche de scène sur officecli-xlsx : hérite de toutes les règles strictes xlsx. NE PAS l’invoquer pour : un simple suivi budgétaire / un CSV mono-feuille avec mise en forme (utiliser xlsx), un modèle financier 3 états / DCF / LBO (utiliser financial-model), un rapport hebdomadaire avec ≤ 1 graphique et < 10 lignes (utiliser xlsx).',
    'pt-BR':
      'Use este skill para criar um dashboard Excel com vários elementos — planilha de dashboard ao abrir, vários cartões KPI baseados em fórmulas, vários gráficos, minigráficos e formatação condicional — a partir de entrada CSV ou tabular. Gatilhos: "dashboard", "dashboard de KPI", "dashboard analítico", "dashboard executivo", "dashboard de métricas", "CSV para dashboard", "visualização de dados". A saída é um único .xlsx. Camada de cena sobre o officecli-xlsx: herda todas as regras rígidas do xlsx. NÃO invoque para: um único rastreador de orçamento / CSV de uma planilha com formatação (use xlsx), um modelo financeiro de 3 demonstrações / DCF / LBO (use financial-model), um relatório semanal com ≤ 1 gráfico e < 10 linhas (use xlsx).',
    'ru-RU':
      'Используйте этот навык для создания многоэлементного Excel-дашборда — лист дашборда при открытии, несколько KPI-карточек на формулах, несколько диаграмм, спарклайны и условное форматирование — из CSV или табличных данных. Триггеры: «дашборд», «KPI-дашборд», «аналитический дашборд», «дашборд для руководства», «дашборд метрик», «CSV в дашборд», «визуализация данных». Результат — один .xlsx. Сценарный слой поверх officecli-xlsx: наследует все строгие правила xlsx. НЕ вызывайте для: одного трекера бюджета / однолистового CSV с форматированием (используйте xlsx), финансовой модели из трёх отчётов / DCF / LBO (используйте financial-model), еженедельного отчёта с ≤ 1 диаграммой и < 10 строк (используйте xlsx).',
    'uk-UA':
      'Використовуйте цей скіл для створення багатоелементного Excel-дашборду — аркуш дашборду при відкритті, кілька KPI-карток на формулах, кілька діаграм, спарклайни та умовне форматування — з CSV або табличних даних. Тригери: «дашборд», «KPI-дашборд», «аналітичний дашборд», «дашборд для керівництва», «дашборд метрик», «CSV у дашборд», «візуалізація даних». Результат — один .xlsx. Сценарний шар поверх officecli-xlsx: успадковує всі жорсткі правила xlsx. НЕ викликайте для: одного трекера бюджету / однолистового CSV із форматуванням (використовуйте xlsx), фінансової моделі з трьох звітів / DCF / LBO (використовуйте financial-model), щотижневого звіту з ≤ 1 діаграмою та < 10 рядків (використовуйте xlsx).',
    'tr-TR':
      'CSV veya tablo girişinden çok öğeli bir Excel panosu oluşturmak için bu beceriyi kullanın — açılışta Pano sayfası, formül tabanlı birden çok KPI kartı, birden çok grafik, mini grafikler ve koşullu biçimlendirme. Tetikleyiciler: "pano", "KPI panosu", "analitik pano", "yönetici panosu", "metrik panosu", "CSV\'den panoya", "veri görselleştirme". Çıktı tek bir .xlsx dosyasıdır. officecli-xlsx üzerinde sahne katmanıdır: tüm xlsx katı kurallarını devralır. Şunlar için çağırmayın: tek bir bütçe takipçisi / biçimlendirmeli tek sayfalık CSV (xlsx kullanın), 3 tablolu / DCF / LBO finansal model (financial-model kullanın), ≤ 1 grafik ve < 10 satır içeren haftalık rapor (xlsx kullanın).',
    'fa-IR':
      'برای ساخت داشبورد Excel چندعنصری — برگه داشبورد در باز شدن، چندین کارت KPI مبتنی بر فرمول، چندین نمودار، اسپارکلاین و قالببندی شرطی — از ورودی CSV یا جدولی استفاده کنید. محرکها: «داشبورد»، «داشبورد KPI»، «داشبورد تحلیلی»، «داشبورد مدیریتی»، «داشبورد شاخصها»، «تبدیل CSV به داشبورد»، «تجسم داده». خروجی یک فایل .xlsx است. لایه صحنه بر روی officecli-xlsx: همه قوانین سخت xlsx را به ارث میبرد. برای موارد زیر فراخوانی نکنید: ردیاب بودجه تکی / CSV تکبرگهای با قالببندی (از xlsx استفاده کنید)، مدل مالی ۳گزارشی / DCF / LBO (از financial-model استفاده کنید)، گزارش هفتگی با حداکثر ۱ نمودار و کمتر از ۱۰ ردیف (از xlsx استفاده کنید).',
  },
  'officecli-docx': {
    'en-US':
      'Use this skill any time a .docx file is involved -- as input, output, or both. This includes: creating Word documents, reports, letters, memos, or proposals; reading, parsing, or extracting text from any .docx file; editing, modifying, or updating existing documents; working with templates, tracked changes, comments, headers/footers, or tables of contents. Trigger whenever the user mentions "Word doc", "document", "report", "letter", "memo", or references a .docx filename.',
    'zh-CN':
      '只要涉及 .docx 文件（作为输入、输出或两者皆是）就使用本技能。包括：创建 Word 文档、报告、信函、备忘录或提案；读取、解析或提取任何 .docx 文件中的文本；编辑、修改或更新现有文档；处理模板、修订、批注、页眉/页脚或目录。只要用户提到"Word 文档"、"文档"、"报告"、"信函"、"备忘录"或引用 .docx 文件名就触发。',
    'zh-TW':
      '只要涉及 .docx 檔案（作為輸入、輸出或兩者皆是）就使用本技能。包括：建立 Word 文件、報告、信函、備忘錄或提案；讀取、解析或擷取任何 .docx 檔案中的文字；編輯、修改或更新現有文件；處理範本、修訂、註解、頁首/頁尾或目錄。只要使用者提到「Word 文件」、「文件」、「報告」、「信函」、「備忘錄」或引用 .docx 檔案名稱就觸發。',
    'ja-JP':
      '.docxファイルが関わる場合（入力、出力、またはその両方）はいつでもこのスキルを使用します。Word文書、レポート、手紙、メモ、提案書の作成；任意の.docxファイルからのテキストの読み取り、解析、抽出；既存文書の編集、修正、更新；テンプレート、変更履歴、コメント、ヘッダー/フッター、目次の処理を含みます。ユーザーが「Word文書」、「文書」、「レポート」、「手紙」、「メモ」に言及したり、.docxファイル名を参照したりしたときにトリガーします。',
    'ko-KR':
      '.docx 파일이 입력, 출력 또는 둘 다로 포함될 때마다 이 스킬을 사용합니다. 여기에는 Word 문서, 보고서, 편지, 메모 또는 제안서 작성; 모든 .docx 파일에서 텍스트 읽기, 파싱 또는 추출; 기존 문서 편집, 수정 또는 업데이트; 템플릿, 변경 내용 추적, 주석, 머리글/바닥글 또는 목차 작업이 포함됩니다. 사용자가 "Word 문서", "문서", "보고서", "편지", "메모"를 언급하거나 .docx 파일 이름을 참조할 때 트리거합니다.',
    'de-DE':
      'Verwenden Sie diesen Skill immer dann, wenn eine .docx-Datei beteiligt ist — als Eingabe, Ausgabe oder beides. Dazu gehören: Erstellen von Word-Dokumenten, Berichten, Briefen, Memos oder Angeboten; Lesen, Parsen oder Extrahieren von Text aus beliebigen .docx-Dateien; Bearbeiten, Ändern oder Aktualisieren vorhandener Dokumente; Arbeiten mit Vorlagen, nachverfolgten Änderungen, Kommentaren, Kopf-/Fußzeilen oder Inhaltsverzeichnissen. Auslösen, wenn der Benutzer "Word-Dokument", "Dokument", "Bericht", "Brief", "Memo" erwähnt oder eine .docx-Datei referenziert.',
    'es-ES':
      'Usa este skill siempre que intervenga un archivo .docx, ya sea como entrada, salida o ambos. Incluye: crear documentos de Word, informes, cartas, memorandos o propuestas; leer, analizar o extraer texto de cualquier archivo .docx; editar, modificar o actualizar documentos existentes; trabajar con plantillas, control de cambios, comentarios, encabezados/pies de página o tablas de contenido. Activa cuando el usuario mencione "documento de Word", "documento", "informe", "carta", "memorando" o haga referencia a un nombre de archivo .docx.',
    'fr-FR':
      'Utilisez ce skill chaque fois qu’un fichier .docx est impliqué — en entrée, en sortie ou les deux. Cela inclut : créer des documents Word, rapports, lettres, mémos ou propositions ; lire, analyser ou extraire du texte de n’importe quel fichier .docx ; modifier, mettre à jour des documents existants ; travailler avec des modèles, le suivi des modifications, les commentaires, les en-têtes/pieds de page ou les tables des matières. Déclenchez lorsque l’utilisateur mentionne « document Word », « document », « rapport », « lettre », « mémo » ou fait référence à un nom de fichier .docx.',
    'pt-BR':
      'Use este skill sempre que um arquivo .docx estiver envolvido — como entrada, saída ou ambos. Isso inclui: criar documentos do Word, relatórios, cartas, memorandos ou propostas; ler, analisar ou extrair texto de qualquer arquivo .docx; editar, modificar ou atualizar documentos existentes; trabalhar com modelos, controle de alterações, comentários, cabeçalhos/rodapés ou sumários. Dispare quando o usuário mencionar "documento do Word", "documento", "relatório", "carta", "memorando" ou fizer referência a um nome de arquivo .docx.',
    'ru-RU':
      'Используйте этот навык всегда, когда задействован файл .docx — как входные данные, выходные или оба. Это включает: создание документов Word, отчётов, писем, служебных записок или предложений; чтение, разбор или извлечение текста из любых файлов .docx; редактирование, изменение или обновление существующих документов; работу с шаблонами, исправлениями, комментариями, колонтитулами или оглавлениями. Активируйте, когда пользователь упоминает «документ Word», «документ», «отчёт», «письмо», «служебную записку» или ссылается на имя файла .docx.',
    'uk-UA':
      'Використовуйте цей скіл завжди, коли задіяно файл .docx — як вхідні дані, вихідні чи обидва. Це включає: створення документів Word, звітів, листів, службових записок або пропозицій; читання, розбір або вилучення тексту з будь-яких файлів .docx; редагування, змінення або оновлення наявних документів; роботу з шаблонами, виправленнями, коментарями, колонтитулами або змістом. Активуйте, коли користувач згадує «документ Word», «документ», «звіт», «лист», «службову записку» або посилається на ім’я файлу .docx.',
    'tr-TR':
      '.docx dosyası girdi, çıktı veya her ikisi olarak dahil olduğunda her zaman bu beceriyi kullanın. Bu şunları içerir: Word belgeleri, raporlar, mektuplar, notlar veya teklifler oluşturmak; herhangi bir .docx dosyasından metin okumak, ayrıştırmak veya çıkarmak; mevcut belgeleri düzenlemek, değiştirmek veya güncellemek; şablonlar, izlenen değişiklikler, yorumlar, üstbilgiler/altbilgiler veya içindekiler tablolarıyla çalışmak. Kullanıcı "Word belgesi", "belge", "rapor", "mektup", "not" ifadelerini kullandığında veya bir .docx dosya adına atıfta bulunduğunda tetikleyin.',
    'fa-IR':
      'هر زمان که فایل .docx درگیر باشد — بهعنوان ورودی، خروجی یا هر دو — از این اسکیل استفاده کنید. این شامل: ایجاد اسناد Word، گزارشها، نامهها، یادداشتهای داخلی یا پیشنهادها؛ خواندن، تجزیه یا استخراج متن از هر فایل .docx؛ ویرایش، اصلاح یا بهروزرسانی اسناد موجود؛ کار با قالبها، تغییرات ردیابیشده، نظرات، سرصفحه/پاصفحه یا فهرست مطالب است. هر زمان که کاربر «سند Word»، «سند»، «گزارش»، «نامه»، «یادداشت» را ذکر کرد یا به نام فایل .docx اشاره کرد، فعال کنید.',
  },
  'officecli-financial-model': {
    'en-US':
      'Use this skill when the user wants to build a financial model — 3-statement model, DCF valuation, LBO, SaaS unit economics, sensitivity / scenario analysis, debt schedule, or fundraising projections — in Excel. Trigger on: "financial model", "3-statement model", "P&L + BS + CF", "DCF", "WACC", "NPV", "terminal value", "LBO", "debt schedule", "cash sweep", "MOIC", "IRR / XIRR", "sensitivity table", "scenario analysis", "ARR model", "unit economics", "CAC / LTV", "cap table forecast". Output is a single formula-driven .xlsx. This skill is a scene layer on top of officecli-xlsx — it inherits every xlsx v2 rule (4-color code, visual floor, number formats, cache-drift, Known Issues, Delivery Gate minimum cycle). DO NOT invoke for a simple budget tracker, CSV dump, or operational KPI sheet — route those to officecli-xlsx base.',
    'zh-CN':
      '当用户想在 Excel 中构建财务模型时使用本技能——三表模型、DCF 估值、LBO、SaaS 单位经济模型、敏感性/情景分析、债务日程或融资预测。触发词包括："财务模型"、"三表模型"、"利润表+资产负债表+现金流量表"、"DCF"、"WACC"、"NPV"、"终值"、"LBO"、"债务日程"、"现金瀑布"、"MOIC"、"IRR/XIRR"、"敏感性分析表"、"情景分析"、"ARR 模型"、"单位经济"、"CAC/LTV"、"股东结构表预测"。输出为单个由公式驱动的 .xlsx 文件。本技能是 officecli-xlsx 之上的场景层——继承全部 xlsx v2 规则（四色代码、视觉下限、数字格式、缓存漂移、已知问题、交付关卡最低周期）。简单的预算追踪、CSV 导出或运营 KPI 表不要调用——请转交 officecli-xlsx 基础版。',
    'zh-TW':
      '當使用者想在 Excel 中建構財務模型時使用本技能——三表模型、DCF 估值、LBO、SaaS 單位經濟模型、敏感性/情境分析、債務時程或融資預測。觸發詞包括："財務模型"、"三表模型"、"損益表+資產負債表+現金流量表"、"DCF"、"WACC"、"NPV"、"終值"、"LBO"、"債務時程"、"現金瀑布"、"MOIC"、"IRR/XIRR"、"敏感性分析表"、"情境分析"、"ARR 模型"、"單位經濟"、"CAC/LTV"、"股權結構表預測"。輸出為單一由公式驅動的 .xlsx 檔案。本技能是 officecli-xlsx 之上的場景層——繼承全部 xlsx v2 規則（四色代碼、視覺下限、數字格式、快取漂移、已知問題、交付關卡最低週期）。簡單的預算追蹤、CSV 匯出或營運 KPI 表請勿呼叫——請轉交 officecli-xlsx 基礎版。',
    'ja-JP':
      'ユーザーがExcelで財務モデル — 3ステートメントモデル、DCF評価、LBO、SaaSユニットエコノミクス、感度/シナリオ分析、債務スケジュール、資金調達予測 — を作成したい場合に使用します。トリガー：「財務モデル」、「3ステートメントモデル」、「P&L + BS + CF」、「DCF」、「WACC」、「NPV」、「ターミナルバリュー」、「LBO」、「債務スケジュール」、「キャッシュスイープ」、「MOIC」、「IRR / XIRR」、「感応度表」、「シナリオ分析」、「ARRモデル」、「ユニットエコノミクス」、「CAC / LTV」、「キャップテーブル予測」。出力は単一の数式駆動.xlsxです。本スキルはofficecli-xlsxのシーン層で、すべてのxlsx v2ルール（4色コード、ビジュアル下限、数値書式、キャッシュドリフト、既知の問題、デリバリーゲート最小サイクル）を継承します。単純な予算トラッカー、CSVダンプ、運用KPIシートには使用しないでください — それらはofficecli-xlsx基本版に振り分けてください。',
    'ko-KR':
      '사용자가 Excel에서 재무 모델 — 3재무제표 모델, DCF 평가, LBO, SaaS 단위 경제성, 민감도/시나리오 분석, 부채 일정 또는 자금 조달 예측 — 을 만들고자 할 때 사용합니다. 트리거: "재무 모델", "3재무제표 모델", "P&L + BS + CF", "DCF", "WACC", "NPV", "터미널 밸류", "LBO", "부채 일정", "캐시 스윕", "MOIC", "IRR / XIRR", "민감도 분석표", "시나리오 분석", "ARR 모델", "단위 경제성", "CAC / LTV", "캡 테이블 예측". 출력은 단일 수식 기반 .xlsx입니다. 이 스킬은 officecli-xlsx 위의 씬 레이어로 모든 xlsx v2 규칙(4색 코드, 비주얼 바닥, 숫자 형식, 캐시 드리프트, 알려진 문제, 전달 게이트 최소 주기)을 상속합니다. 단순한 예산 추적기, CSV 덤프 또는 운영 KPI 시트에는 호출하지 마세요 — officecli-xlsx 기본으로 안내하세요.',
    'de-DE':
      'Verwenden Sie diesen Skill, wenn der Benutzer ein Finanzmodell — Drei-Statement-Modell, DCF-Bewertung, LBO, SaaS-Unit-Economics, Sensitivitäts-/Szenarioanalyse, Schuldenplan oder Finanzierungsprognosen — in Excel erstellen möchte. Auslöser: "Finanzmodell", "Drei-Statement-Modell", "P&L + BS + CF", "DCF", "WACC", "NPV", "Restwert", "LBO", "Schuldenplan", "Cash Sweep", "MOIC", "IRR / XIRR", "Sensitivitätstabelle", "Szenarioanalyse", "ARR-Modell", "Unit Economics", "CAC / LTV", "Cap-Table-Prognose". Ausgabe ist eine einzelne formelgesteuerte .xlsx. Dieser Skill ist eine Szenenebene über officecli-xlsx — er erbt alle xlsx-v2-Regeln (4-Farben-Code, visuelle Untergrenze, Zahlenformate, Cache-Drift, bekannte Probleme, Mindestzyklus des Delivery Gate). NICHT für einfache Budget-Tracker, CSV-Dumps oder operative KPI-Blätter verwenden — leiten Sie diese an officecli-xlsx weiter.',
    'es-ES':
      'Usa este skill cuando el usuario quiera construir un modelo financiero — modelo de 3 estados, valoración DCF, LBO, economía unitaria SaaS, análisis de sensibilidad / escenarios, calendario de deuda o proyecciones de financiación — en Excel. Disparadores: "modelo financiero", "modelo de 3 estados", "P&L + BS + CF", "DCF", "WACC", "NPV", "valor terminal", "LBO", "calendario de deuda", "cash sweep", "MOIC", "IRR / XIRR", "tabla de sensibilidad", "análisis de escenarios", "modelo ARR", "economía unitaria", "CAC / LTV", "previsión de cap table". La salida es un único .xlsx impulsado por fórmulas. Este skill es una capa de escena sobre officecli-xlsx: hereda todas las reglas v2 de xlsx (código de 4 colores, nivel visual mínimo, formatos de número, cache-drift, problemas conocidos, ciclo mínimo del Delivery Gate). NO lo invoques para un simple rastreador de presupuesto, volcado CSV u hoja KPI operativa: dirígelos a officecli-xlsx base.',
    'fr-FR':
      'Utilisez ce skill lorsque l’utilisateur souhaite construire un modèle financier — modèle à 3 états, valorisation DCF, LBO, économie unitaire SaaS, analyse de sensibilité / de scénarios, calendrier de dette ou projections de levée de fonds — dans Excel. Déclencheurs : « modèle financier », « modèle à 3 états », « P&L + BS + CF », « DCF », « WACC », « NPV », « valeur terminale », « LBO », « calendrier de dette », « cash sweep », « MOIC », « IRR / XIRR », « tableau de sensibilité », « analyse de scénarios », « modèle ARR », « économie unitaire », « CAC / LTV », « prévision de cap table ». Sortie : un seul .xlsx piloté par formules. Ce skill est une couche de scène au-dessus d’officecli-xlsx — il hérite de toutes les règles xlsx v2 (code 4 couleurs, plancher visuel, formats de nombres, cache-drift, problèmes connus, cycle minimum du Delivery Gate). NE PAS l’invoquer pour un simple suivi budgétaire, un dump CSV ou une feuille KPI opérationnelle — orientez-les vers officecli-xlsx de base.',
    'pt-BR':
      'Use este skill quando o usuário quiser construir um modelo financeiro — modelo de 3 demonstrações, avaliação DCF, LBO, economia unitária SaaS, análise de sensibilidade / cenários, cronograma de dívida ou projeções de captação — no Excel. Gatilhos: "modelo financeiro", "modelo de 3 demonstrações", "P&L + BS + CF", "DCF", "WACC", "NPV", "valor terminal", "LBO", "cronograma de dívida", "cash sweep", "MOIC", "IRR / XIRR", "tabela de sensibilidade", "análise de cenários", "modelo ARR", "economia unitária", "CAC / LTV", "previsão de cap table". A saída é um único .xlsx orientado por fórmulas. Este skill é uma camada de cena sobre o officecli-xlsx — herda todas as regras v2 do xlsx (código de 4 cores, piso visual, formatos de número, cache-drift, problemas conhecidos, ciclo mínimo do Delivery Gate). NÃO invoque para um simples rastreador de orçamento, dump de CSV ou planilha KPI operacional — direcione-os ao officecli-xlsx base.',
    'ru-RU':
      'Используйте этот навык, когда пользователь хочет построить финансовую модель — модель из трёх отчётов, оценку DCF, LBO, юнит-экономику SaaS, анализ чувствительности / сценариев, график погашения долга или прогнозы привлечения капитала — в Excel. Триггеры: «финансовая модель», «модель из трёх отчётов», «P&L + BS + CF», «DCF», «WACC», «NPV», «терминальная стоимость», «LBO», «график погашения долга», «cash sweep», «MOIC», «IRR / XIRR», «таблица чувствительности», «сценарный анализ», «модель ARR», «юнит-экономика», «CAC / LTV», «прогноз cap table». Результат — один .xlsx на формулах. Этот навык — сценарный слой поверх officecli-xlsx: наследует все правила xlsx v2 (четырёхцветный код, визуальный минимум, числовые форматы, cache-drift, известные проблемы, минимальный цикл Delivery Gate). НЕ вызывайте для простого трекера бюджета, CSV-дампа или операционной KPI-таблицы — направляйте их на базовый officecli-xlsx.',
    'uk-UA':
      'Використовуйте цей скіл, коли користувач хоче побудувати фінансову модель — модель із трьох звітів, оцінку DCF, LBO, юніт-економіку SaaS, аналіз чутливості / сценаріїв, графік погашення боргу або прогнози залучення капіталу — у Excel. Тригери: «фінансова модель», «модель із трьох звітів», «P&L + BS + CF», «DCF», «WACC», «NPV», «термінальна вартість», «LBO», «графік погашення боргу», «cash sweep», «MOIC», «IRR / XIRR», «таблиця чутливості», «сценарний аналіз», «модель ARR», «юніт-економіка», «CAC / LTV», «прогноз cap table». Результат — один .xlsx на формулах. Цей скіл — сценарний шар поверх officecli-xlsx: успадковує всі правила xlsx v2 (чотириколірний код, візуальний мінімум, числові формати, cache-drift, відомі проблеми, мінімальний цикл Delivery Gate). НЕ викликайте для простого трекера бюджету, CSV-дампа або операційної KPI-таблиці — спрямовуйте їх на базовий officecli-xlsx.',
    'tr-TR':
      'Kullanıcı Excel\'de bir finansal model — 3 tablolu model, DCF değerleme, LBO, SaaS birim ekonomisi, duyarlılık / senaryo analizi, borç takvimi veya fonlama projeksiyonları — oluşturmak istediğinde bu beceriyi kullanın. Tetikleyiciler: "finansal model", "3 tablolu model", "P&L + BS + CF", "DCF", "WACC", "NPV", "terminal değeri", "LBO", "borç takvimi", "nakit süpürme", "MOIC", "IRR / XIRR", "duyarlılık tablosu", "senaryo analizi", "ARR modeli", "birim ekonomisi", "CAC / LTV", "cap table tahmini". Çıktı tek bir formül tabanlı .xlsx dosyasıdır. Bu beceri officecli-xlsx\'in üzerinde bir sahne katmanıdır — tüm xlsx v2 kurallarını (4 renk kodu, görsel taban, sayı biçimleri, önbellek kayması, bilinen sorunlar, Teslim Kapısı minimum döngüsü) devralır. Basit bir bütçe takipçisi, CSV dökümü veya operasyonel KPI sayfası için çağırmayın — bunları officecli-xlsx tabanına yönlendirin.',
    'fa-IR':
      'زمانی استفاده کنید که کاربر میخواهد یک مدل مالی — مدل سهر گزارشی، ارزشگذاری DCF، LBO، اقتصاد واحد SaaS، تحلیل حساسیت/سناریو، جدول زمانی بدهی یا پیشبینی تأمین مالی — در Excel بسازد. محرکها: «مدل مالی»، «مدل سهر گزارشی»، «P&L + BS + CF»، «DCF»، «WACC»، «NPV»، «ارزش پایانی»، «LBO»، «جدول زمانی بدهی»، «نقدینگی sweep»، «MOIC»، «IRR / XIRR»، «جدول حساسیت»، «تحلیل سناریو»، «مدل ARR»، «اقتصاد واحد»، «CAC / LTV»، «پیشبینی cap table». خروجی یک فایل .xlsx مبتنی بر فرمول است. این اسکیل لایه صحنه بر روی officecli-xlsx است — همه قوانین xlsx v2 (کد چهاررنگ، کف بصری، قالب اعداد، انحراف کش، مشکلات شناختهشده، حداقل چرخه دروازه تحویل) را به ارث میبرد. برای ردیاب بودجه ساده، خروجی CSV یا برگه KPI عملیاتی فراخوانی نکنید — آنها را به officecli-xlsx پایه هدایت کنید.',
  },
  'officecli-pitch-deck': {
    'en-US':
      'Use this skill when the user is building a fundraising / investor pitch deck — seed, Series A / B / C, convertible note, SAFE round, strategic raise. Trigger on: "pitch deck", "investor deck", "Series A deck", "Series B deck", "Series C deck", "fundraising deck", "seed pitch", "VC deck", "raising capital", "term sheet presentation". Output is a single .pptx. This skill is a scene layer on top of officecli-pptx — inherits every pptx v2 rule (visual floor, grid, palettes, connector canon, Delivery Gate). DO NOT invoke for a generic board review, sales deck, all-hands, or product launch — route those to officecli-pptx base.',
    'zh-CN':
      '当用户正在制作融资/投资人路演 PPT 时使用本技能——种子轮、A/B/C 轮、可转债、SAFE 轮、战略融资。触发词包括："路演 PPT"、"投资人 PPT"、"A 轮 PPT"、"B 轮 PPT"、"C 轮 PPT"、"融资 PPT"、"种子轮路演"、"VC PPT"、"筹集资金"、"条款清单演示"。输出为单个 .pptx 文件。本技能是 officecli-pptx 之上的场景层——继承全部 pptx v2 规则（视觉下限、网格、调色板、连线规范、交付关卡）。普通的董事会汇报、销售演示、全员大会或产品发布会不要调用——请转交 officecli-pptx 基础版。',
    'zh-TW':
      '當使用者正在製作融資/投資人路演簡報時使用本技能——種子輪、A/B/C 輪、可轉債、SAFE 輪、策略融資。觸發詞包括："路演簡報"、"投資人簡報"、"A 輪簡報"、"B 輪簡報"、"C 輪簡報"、"融資簡報"、"種子輪路演"、"VC 簡報"、"籌集資金"、"條款清單簡報"。輸出為單一 .pptx 檔案。本技能是 officecli-pptx 之上的場景層——繼承全部 pptx v2 規則（視覺下限、格線、調色盤、連線規範、交付關卡）。普通的董事會彙報、銷售簡報、全員大會或產品發表會請勿呼叫——請轉交 officecli-pptx 基礎版。',
    'ja-JP':
      'ユーザーが資金調達 / 投資家向けピッチデッキ — シード、シリーズA / B / C、転換社債、SAFEラウンド、戦略的調達 — を作成している場合に使用します。トリガー：「ピッチデッキ」、「投資家向けデッキ」、「シリーズAデッキ」、「シリーズBデッキ」、「シリーズCデッキ」、「資金調達デッキ」、「シードピッチ」、「VCデッキ」、「資金調達」、「タームシートのプレゼン」。出力は単一の.pptxです。本スキルはofficecli-pptxのシーン層で、すべてのpptx v2ルール（ビジュアル下限、グリッド、パレット、コネクタ規範、デリバリーゲート）を継承します。一般的な取締役会レビュー、営業デッキ、全社集会、製品ローンチには使用しないでください — それらはofficecli-pptx基本版に振り分けてください。',
    'ko-KR':
      '사용자가 자금 조달 / 투자자용 피치 덱 — 시드, 시리즈 A / B / C, 전환사채, SAFE 라운드, 전략적 조달 — 을 만들 때 사용합니다. 트리거: "피치 덱", "투자자 덱", "시리즈 A 덱", "시리즈 B 덱", "시리즈 C 덱", "자금 조달 덱", "시드 피치", "VC 덱", "자본 조달", "텀시트 발표". 출력은 단일 .pptx입니다. 이 스킬은 officecli-pptx 위의 씬 레이어로 모든 pptx v2 규칙(비주얼 바닥, 그리드, 팔레트, 커넥터 규범, 전달 게이트)을 상속합니다. 일반적인 이사회 리뷰, 영업 덱, 전체 회의 또는 제품 출시에는 호출하지 마세요 — officecli-pptx 기본으로 안내하세요.',
    'de-DE':
      'Verwenden Sie diesen Skill, wenn der Benutzer einen Fundraising-/Investor-Pitch-Deck erstellt — Seed, Series A / B / C, Wandelanleihe, SAFE-Runde, strategische Finanzierung. Auslöser: "Pitch-Deck", "Investor-Deck", "Series-A-Deck", "Series-B-Deck", "Series-C-Deck", "Fundraising-Deck", "Seed-Pitch", "VC-Deck", "Kapitalbeschaffung", "Term-Sheet-Präsentation". Ausgabe ist eine einzelne .pptx. Dieser Skill ist eine Szenenebene über officecli-pptx — er erbt alle pptx-v2-Regeln (visuelle Untergrenze, Raster, Paletten, Connector-Kanon, Delivery Gate). NICHT für generische Vorstandsreviews, Sales-Decks, All-Hands oder Produktlaunches verwenden — leiten Sie diese an officecli-pptx weiter.',
    'es-ES':
      'Usa este skill cuando el usuario esté creando un pitch deck de financiación / para inversores — semilla, Serie A / B / C, pagaré convertible, ronda SAFE, ampliación estratégica. Disparadores: "pitch deck", "deck para inversores", "deck Serie A", "deck Serie B", "deck Serie C", "deck de financiación", "pitch semilla", "deck VC", "recaudar capital", "presentación de term sheet". La salida es un único .pptx. Este skill es una capa de escena sobre officecli-pptx: hereda todas las reglas v2 de pptx (nivel visual mínimo, cuadrícula, paletas, canon de conectores, Delivery Gate). NO lo invoques para revisiones genéricas de directorio, decks de ventas, reuniones generales o lanzamientos de producto: dirígelos a officecli-pptx base.',
    'fr-FR':
      'Utilisez ce skill lorsque l’utilisateur crée un pitch deck de levée de fonds / pour investisseurs — seed, série A / B / C, note convertible, tour SAFE, levée stratégique. Déclencheurs : « pitch deck », « deck investisseurs », « deck série A », « deck série B », « deck série C », « deck de levée de fonds », « pitch seed », « deck VC », « lever des capitaux », « présentation de term sheet ». Sortie : un seul .pptx. Ce skill est une couche de scène au-dessus d’officecli-pptx — il hérite de toutes les règles pptx v2 (plancher visuel, grille, palettes, canon des connecteurs, Delivery Gate). NE PAS l’invoquer pour une revue de conseil générique, un deck commercial, une réunion générale ou un lancement produit — orientez-les vers officecli-pptx de base.',
    'pt-BR':
      'Use este skill quando o usuário estiver criando um pitch deck de captação / para investidores — seed, Série A / B / C, nota conversível, rodada SAFE, captação estratégica. Gatilhos: "pitch deck", "deck para investidores", "deck Série A", "deck Série B", "deck Série C", "deck de captação", "pitch seed", "deck VC", "captar capital", "apresentação de term sheet". A saída é um único .pptx. Este skill é uma camada de cena sobre o officecli-pptx — herda todas as regras v2 do pptx (piso visual, grade, paletas, cânon de conectores, Delivery Gate). NÃO invoque para revisões genéricas de diretoria, decks de vendas, reuniões gerais ou lançamentos de produto — direcione-os ao officecli-pptx base.',
    'ru-RU':
      'Используйте этот навык, когда пользователь создаёт питч-дек для привлечения капитала / инвесторов — посевной раунд, серия A / B / C, конвертируемая нота, раунд SAFE, стратегическое привлечение. Триггеры: «питч-дек», «дек для инвесторов», «дек серии A», «дек серии B», «дек серии C», «дек для сбора средств», «посевной питч», «VC-дек», «привлечение капитала», «презентация term sheet». Результат — один .pptx. Этот навык — сценарный слой поверх officecli-pptx: наследует все правила pptx v2 (визуальный минимум, сетка, палитры, канон соединителей, Delivery Gate). НЕ вызывайте для общих обзоров для совета директоров, продающих деков, общих собраний или запусков продуктов — направляйте их на базовый officecli-pptx.',
    'uk-UA':
      'Використовуйте цей скіл, коли користувач створює пітч-дек для залучення капіталу / інвесторів — посівний раунд, серія A / B / C, конвертована нота, раунд SAFE, стратегічне залучення. Тригери: «пітч-дек», «дек для інвесторів», «дек серії A», «дек серії B», «дек серії C», «дек для збору коштів», «посівний пітч», «VC-дек», «залучення капіталу», «презентація term sheet». Результат — один .pptx. Цей скіл — сценарний шар поверх officecli-pptx: успадковує всі правила pptx v2 (візуальний мінімум, сітка, палітри, канон з’єднувачів, Delivery Gate). НЕ викликайте для загальних оглядів для ради директорів, продавальних деків, загальних зборів або запусків продуктів — спрямовуйте їх на базовий officecli-pptx.',
    'tr-TR':
      'Kullanıcı bir fonlama / yatırımcı sunumu (pitch deck) hazırladığında — tohum, Seri A / B / C, dönüştürülebilir senet, SAFE turu, stratejik fonlama — bu beceriyi kullanın. Tetikleyiciler: "pitch deck", "yatırımcı deck", "Seri A deck", "Seri B deck", "Seri C deck", "fonlama deck", "tohum pitch", "VC deck", "sermaye toplama", "term sheet sunumu". Çıktı tek bir .pptx dosyasıdır. Bu beceri officecli-pptx\'in üzerinde bir sahne katmanıdır — tüm pptx v2 kurallarını (görsel taban, ızgara, paletler, bağlayıcı kuralları, Teslim Kapısı) devralır. Genel yönetim kurulu değerlendirmesi, satış sunumu, genel toplantı veya ürün lansmanı için çağırmayın — bunları officecli-pptx tabanına yönlendirin.',
    'fa-IR':
      'زمانی استفاده کنید که کاربر در حال ساخت پیتچدک جذب سرمایه / ارائه به سرمایهگذار است — مرحله seed، سری A / B / C، اوراق قرضه قابل تبدیل، دور SAFE، جذب استراتژیک. محرکها: «پیتچدک»، «دک سرمایهگذار»، «دک سری A»، «دک سری B»، «دک سری C»، «دک جذب سرمایه»، «پیتچ seed»، «دک VC»، «جذب سرمایه»، «ارائه term sheet». خروجی یک فایل .pptx است. این اسکیل لایه صحنه بر روی officecli-pptx است — همه قوانین pptx v2 (کف بصری، شبکه، پالتها، قانون اتصالدهندهها، دروازه تحویل) را به ارث میبرد. برای بررسی کلی هیئتمدیره، دک فروش، جلسه عمومی یا عرضه محصول فراخوانی نکنید — آنها را به officecli-pptx پایه هدایت کنید.',
  },
  'officecli-pptx': {
    'en-US':
      'Use this skill any time a .pptx file is involved -- as input, output, or both. This includes: creating slide decks, pitch decks, or presentations; reading, parsing, or extracting text from any .pptx file; editing, modifying, or updating existing presentations; combining or splitting slide files; working with templates, layouts, speaker notes, or comments. Trigger whenever the user mentions "deck", "slides", "presentation", "pitch", or references a .pptx filename.',
    'zh-CN':
      '只要涉及 .pptx 文件（作为输入、输出或两者皆是）就使用本技能。包括：创建幻灯片演示文稿、路演 PPT 或演示；读取、解析或提取任何 .pptx 文件中的文本；编辑、修改或更新现有演示文稿；合并或拆分幻灯片文件；处理模板、版式、演讲者备注或批注。只要用户提到"演示文稿"、"幻灯片"、"PPT"、"路演"或引用 .pptx 文件名就触发。',
    'zh-TW':
      '只要涉及 .pptx 檔案（作為輸入、輸出或兩者皆是）就使用本技能。包括：建立投影片簡報、路演簡報或簡報；讀取、解析或擷取任何 .pptx 檔案中的文字；編輯、修改或更新現有簡報；合併或拆分投影片檔案；處理範本、版面配置、講者備註或註解。只要使用者提到「簡報」、「投影片」、「PPT」、「路演」或引用 .pptx 檔案名稱就觸發。',
    'ja-JP':
      '.pptxファイルが関わる場合（入力、出力、またはその両方）はいつでもこのスキルを使用します。スライドデッキ、ピッチデッキ、プレゼンテーションの作成；任意の.pptxファイルからのテキストの読み取り、解析、抽出；既存プレゼンテーションの編集、修正、更新；スライドファイルの結合・分割；テンプレート、レイアウト、発表者ノート、コメントの処理を含みます。ユーザーが「デッキ」、「スライド」、「プレゼンテーション」、「ピッチ」に言及したり、.pptxファイル名を参照したりしたときにトリガーします。',
    'ko-KR':
      '.pptx 파일이 입력, 출력 또는 둘 다로 포함될 때마다 이 스킬을 사용합니다. 여기에는 슬라이드 덱, 피치 덱 또는 프레젠테이션 만들기; 모든 .pptx 파일에서 텍스트 읽기, 파싱 또는 추출; 기존 프레젠테이션 편집, 수정 또는 업데이트; 슬라이드 파일 병합 또는 분할; 템플릿, 레이아웃, 발표자 노트 또는 주석 작업이 포함됩니다. 사용자가 "덱", "슬라이드", "프레젠테이션", "피치"를 언급하거나 .pptx 파일 이름을 참조할 때 트리거합니다.',
    'de-DE':
      'Verwenden Sie diesen Skill immer dann, wenn eine .pptx-Datei beteiligt ist — als Eingabe, Ausgabe oder beides. Dazu gehören: Erstellen von Slide-Decks, Pitch-Decks oder Präsentationen; Lesen, Parsen oder Extrahieren von Text aus beliebigen .pptx-Dateien; Bearbeiten, Ändern oder Aktualisieren vorhandener Präsentationen; Kombinieren oder Teilen von Slidedateien; Arbeiten mit Vorlagen, Layouts, Sprechernotizen oder Kommentaren. Auslösen, wenn der Benutzer "Deck", "Folien", "Präsentation", "Pitch" erwähnt oder eine .pptx-Datei referenziert.',
    'es-ES':
      'Usa este skill siempre que intervenga un archivo .pptx, ya sea como entrada, salida o ambos. Incluye: crear decks de diapositivas, pitch decks o presentaciones; leer, analizar o extraer texto de cualquier archivo .pptx; editar, modificar o actualizar presentaciones existentes; combinar o dividir archivos de diapositivas; trabajar con plantillas, diseños, notas del presentador o comentarios. Activa cuando el usuario mencione "deck", "diapositivas", "presentación", "pitch" o haga referencia a un nombre de archivo .pptx.',
    'fr-FR':
      'Utilisez ce skill chaque fois qu’un fichier .pptx est impliqué — en entrée, en sortie ou les deux. Cela inclut : créer des decks de diapositives, des pitch decks ou des présentations ; lire, analyser ou extraire du texte de n’importe quel fichier .pptx ; modifier, mettre à jour des présentations existantes ; combiner ou diviser des fichiers de diapositives ; travailler avec des modèles, des mises en page, des notes de l’orateur ou des commentaires. Déclenchez lorsque l’utilisateur mentionne « deck », « diapositives », « présentation », « pitch » ou fait référence à un nom de fichier .pptx.',
    'pt-BR':
      'Use este skill sempre que um arquivo .pptx estiver envolvido — como entrada, saída ou ambos. Isso inclui: criar decks de slides, pitch decks ou apresentações; ler, analisar ou extrair texto de qualquer arquivo .pptx; editar, modificar ou atualizar apresentações existentes; combinar ou dividir arquivos de slides; trabalhar com modelos, layouts, anotações do apresentador ou comentários. Dispare quando o usuário mencionar "deck", "slides", "apresentação", "pitch" ou fizer referência a um nome de arquivo .pptx.',
    'ru-RU':
      'Используйте этот навык всегда, когда задействован файл .pptx — как входные данные, выходные или оба. Это включает: создание слайд-деков, питч-деков или презентаций; чтение, разбор или извлечение текста из любых файлов .pptx; редактирование, изменение или обновление существующих презентаций; объединение или разделение файлов слайдов; работу с шаблонами, макетами, заметками докладчика или комментариями. Активируйте, когда пользователь упоминает «дек», «слайды», «презентацию», «питч» или ссылается на имя файла .pptx.',
    'uk-UA':
      'Використовуйте цей скіл завжди, коли задіяно файл .pptx — як вхідні дані, вихідні чи обидва. Це включає: створення слайд-деків, пітч-деків або презентацій; читання, розбір або вилучення тексту з будь-яких файлів .pptx; редагування, змінення або оновлення наявних презентацій; об’єднання або розділення файлів слайдів; роботу з шаблонами, макетами, нотатками доповідача або коментарями. Активуйте, коли користувач згадує «дек», «слайди», «презентацію», «пітч» або посилається на ім’я файлу .pptx.',
    'tr-TR':
      '.pptx dosyası girdi, çıktı veya her ikisi olarak dahil olduğunda her zaman bu beceriyi kullanın. Bu şunları içerir: slayt destesi, pitch deck veya sunum oluşturmak; herhangi bir .pptx dosyasından metin okumak, ayrıştırmak veya çıkarmak; mevcut sunumları düzenlemek, değiştirmek veya güncellemek; slayt dosyalarını birleştirmek veya bölmek; şablonlar, düzenler, sunucu notları veya yorumlarla çalışmak. Kullanıcı "deck", "slayt", "sunum", "pitch" ifadelerini kullandığında veya bir .pptx dosya adına atıfta bulunduğunda tetikleyin.',
    'fa-IR':
      'هر زمان که فایل .pptx درگیر باشد — بهعنوان ورودی، خروجی یا هر دو — از این اسکیل استفاده کنید. این شامل: ایجاد دک اسلاید، پیتچدک یا ارائه؛ خواندن، تجزیه یا استخراج متن از هر فایل .pptx؛ ویرایش، اصلاح یا بهروزرسانی ارائههای موجود؛ ترکیب یا تقسیم فایلهای اسلاید؛ کار با قالبها، چیدمانها، یادداشتهای ارائهدهنده یا نظرات است. هر زمان که کاربر «دک»، «اسلاید»، «ارائه»، «پیتچ» را ذکر کرد یا به نام فایل .pptx اشاره کرد، فعال کنید.',
  },
  'officecli-word-form': {
    'en-US':
      'Use this skill to create fillable Word forms (.docx) with real Content Controls (SDT) + legacy FormField checkboxes + MERGEFIELD mail-merge placeholders + document protection. Trigger on: "fillable form", "form fields", "content controls", "SDT", "word form", "fill in", "only editable fields", "protect document", "onboarding form", "HR intake", "survey template", "contract / SOW template", "mail-merge template", "compliance checklist", "medical intake questionnaire". Output is a single .docx where specific fields are editable and the rest is locked. This skill is INDEPENDENT, not a scene layer on docx — payload is `<w:sdt>` + `<w:ffData>` + `<w:fldChar>` + `documentProtection`, none of which docx base skill covers. Do NOT trigger for regular reports, letters, memos, academic papers, pitch decks, or any document with no user-fillable fields — route those to officecli-docx or its scene layers.',
    'zh-CN':
      '使用本技能创建可填写的 Word 表单（.docx），包含真正的内容控件（SDT）、传统表单域复选框、MERGEFIELD 邮件合并占位符以及文档保护。触发词包括："可填写表单"、"表单域"、"内容控件"、"SDT"、"Word 表单"、"填写"、"仅可编辑字段"、"保护文档"、"入职表单"、"HR 信息采集"、"调查问卷模板"、"合同/SOW 模板"、"邮件合并模板"、"合规检查清单"、"医疗信息采集问卷"。输出为单个 .docx 文件，其中指定字段可编辑、其余部分锁定。本技能是独立技能，不是 docx 的场景层——底层是 `<w:sdt>` + `<w:ffData>` + `<w:fldChar>` + `documentProtection`，这些都不在 docx 基础技能覆盖范围内。常规报告、信函、备忘录、学术论文、路演 PPT 或任何没有可填写字段的文档不要触发——请转交 officecli-docx 或其场景层。',
    'zh-TW':
      '使用本技能建立可填寫的 Word 表單（.docx），包含真正的內容控制項（SDT）、傳統表單欄位核取方塊、MERGEFIELD 郵件合併佔位符與文件保護。觸發詞包括："可填寫表單"、"表單欄位"、"內容控制項"、"SDT"、"Word 表單"、"填寫"、"僅可編輯欄位"、"保護文件"、"入職表單"、"HR 資訊蒐集"、"問卷調查範本"、"合約/SOW 範本"、"郵件合併範本"、"合規檢查清單"、"醫療資訊蒐集問卷"。輸出為單一 .docx 檔案，其中指定欄位可編輯、其餘部分鎖定。本技能是獨立技能，不是 docx 的場景層——底層是 `<w:sdt>` + `<w:ffData>` + `<w:fldChar>` + `documentProtection`，這些都不在 docx 基礎技能涵蓋範圍內。一般報告、信函、備忘錄、學術論文、路演簡報或任何沒有可填寫欄位的文件請勿觸發——請轉交 officecli-docx 或其場景層。',
    'ja-JP':
      '実際のコンテンツコントロール（SDT）+ 従来のフォームフィールドチェックボックス + MERGEFIELDメールマージプレースホルダー + 文書保護を備えた、入力可能なWordフォーム（.docx）を作成するために使用します。トリガー：「入力可能フォーム」、「フォームフィールド」、「コンテンツコントロール」、「SDT」、「Wordフォーム」、「入力」、「編集可能なフィールドのみ」、「文書保護」、「オンボーディングフォーム」、「HR受付」、「アンケートテンプレート」、「契約/SOWテンプレート」、「メールマージテンプレート」、「コンプライアンスチェックリスト」、「医療受付アンケート」。出力は、指定フィールドのみ編集可能で残りがロックされた単一の.docxです。本スキルは独立しており、docxのシーン層ではありません — ペイロードは`<w:sdt>` + `<w:ffData>` + `<w:fldChar>` + `documentProtection`で、いずれもdocx基本スキルの対象外です。通常のレポート、手紙、メモ、学術論文、ピッチデッキ、または入力可能なフィールドのない文書には使用しないでください — それらはofficecli-docxまたはそのシーン層に振り分けてください。',
    'ko-KR':
      '실제 콘텐츠 컨트롤(SDT) + 레거시 양식 필드 체크박스 + MERGEFIELD 메일 병합 자리 표시자 + 문서 보호 기능이 있는 입력 가능한 Word 양식(.docx)을 만들 때 사용합니다. 트리거: "입력 가능한 양식", "양식 필드", "콘텐츠 컨트롤", "SDT", "Word 양식", "작성", "편집 가능한 필드만", "문서 보호", "온보딩 양식", "HR 접수", "설문 템플릿", "계약/SOW 템플릿", "메일 병합 템플릿", "규정 준수 체크리스트", "의료 접수 설문". 출력은 특정 필드만 편집 가능하고 나머지는 잠긴 단일 .docx입니다. 이 스킬은 docx의 씬 레이어가 아닌 독립 스킬입니다 — 페이로드는 `<w:sdt>` + `<w:ffData>` + `<w:fldChar>` + `documentProtection`이며, 이 중 어떤 것도 docx 기본 스킬에서 다루지 않습니다. 일반 보고서, 편지, 메모, 학술 논문, 피치 덱 또는 사용자 입력 필드가 없는 문서에는 트리거하지 마세요 — officecli-docx 또는 그 씬 레이어로 안내하세요.',
    'de-DE':
      'Verwenden Sie diesen Skill, um ausfüllbare Word-Formulare (.docx) mit echten Content-Controls (SDT) + klassischen Formularfeld-Kontrollkästchen + MERGEFIELD-Serienbrieffeldern + Dokumentenschutz zu erstellen. Auslöser: "ausfüllbares Formular", "Formularfelder", "Content-Controls", "SDT", "Word-Formular", "ausfüllen", "nur bearbeitbare Felder", "Dokument schützen", "Onboarding-Formular", "HR-Erfassung", "Umfragevorlage", "Vertrags-/SOW-Vorlage", "Serienbriefvorlage", "Compliance-Checkliste", "medizinischer Aufnahmefragebogen". Ausgabe ist eine einzelne .docx, in der bestimmte Felder bearbeitbar und der Rest gesperrt ist. Dieser Skill ist UNABHÄNGIG und keine Szenenebene über docx — das Payload sind `<w:sdt>` + `<w:ffData>` + `<w:fldChar>` + `documentProtection`, die der Basis-Skill docx nicht abdeckt. NICHT für normale Berichte, Briefe, Memos, akademische Arbeiten, Pitch-Decks oder Dokumente ohne ausfüllbare Felder verwenden — leiten Sie diese an officecli-docx oder dessen Szenenebenen weiter.',
    'es-ES':
      'Usa este skill para crear formularios de Word rellenables (.docx) con controles de contenido reales (SDT) + casillas de verificación de campos de formulario heredados + marcadores de combinación de correspondencia MERGEFIELD + protección de documentos. Disparadores: "formulario rellenable", "campos de formulario", "controles de contenido", "SDT", "formulario de Word", "rellenar", "solo campos editables", "proteger documento", "formulario de incorporación", "captación de RR. HH.", "plantilla de encuesta", "plantilla de contrato/SOW", "plantilla de combinación de correspondencia", "lista de verificación de cumplimiento", "cuestionario de admisión médica". La salida es un único .docx donde los campos específicos son editables y el resto está bloqueado. Este skill es INDEPENDIENTE, no es una capa de escena sobre docx: el payload son `<w:sdt>` + `<w:ffData>` + `<w:fldChar>` + `documentProtection`, que el skill base de docx no cubre. NO lo actives para informes normales, cartas, memorandos, artículos académicos, pitch decks o cualquier documento sin campos rellenables: dirígelos a officecli-docx o sus capas de escena.',
    'fr-FR':
      'Utilisez ce skill pour créer des formulaires Word remplissables (.docx) avec de véritables contrôles de contenu (SDT) + cases à cocher de champs de formulaire hérités + espaces réservés de publipostage MERGEFIELD + protection de document. Déclencheurs : « formulaire remplissable », « champs de formulaire », « contrôles de contenu », « SDT », « formulaire Word », « remplir », « uniquement les champs modifiables », « protéger le document », « formulaire d’intégration », « collecte RH », « modèle de sondage », « modèle de contrat / SOW », « modèle de publipostage », « liste de contrôle de conformité », « questionnaire d’admission médicale ». Sortie : un seul .docx où les champs spécifiques sont modifiables et le reste est verrouillé. Ce skill est INDÉPENDANT, ce n’est pas une couche de scène sur docx — le payload est `<w:sdt>` + `<w:ffData>` + `<w:fldChar>` + `documentProtection`, qu’aucun d’eux le skill docx de base ne couvre. NE PAS déclencher pour des rapports classiques, lettres, mémos, articles académiques, pitch decks ou tout document sans champs remplissables — orientez-les vers officecli-docx ou ses couches de scène.',
    'pt-BR':
      'Use este skill para criar formulários Word preenchíveis (.docx) com controles de conteúdo reais (SDT) + caixas de seleção de campos de formulário legados + espaços reservados de mala direta MERGEFIELD + proteção de documento. Gatilhos: "formulário preenchível", "campos de formulário", "controles de conteúdo", "SDT", "formulário do Word", "preencher", "somente campos editáveis", "proteger documento", "formulário de integração", "captação de RH", "modelo de pesquisa", "modelo de contrato/SOW", "modelo de mala direta", "checklist de conformidade", "questionário de admissão médica". A saída é um único .docx onde campos específicos são editáveis e o restante é bloqueado. Este skill é INDEPENDENTE, não é uma camada de cena sobre docx — o payload é `<w:sdt>` + `<w:ffData>` + `<w:fldChar>` + `documentProtection`, nenhum dos quais o skill base docx cobre. NÃO dispare para relatórios comuns, cartas, memorandos, artigos acadêmicos, pitch decks ou qualquer documento sem campos preenchíveis — direcione-os ao officecli-docx ou suas camadas de cena.',
    'ru-RU':
      'Используйте этот навык для создания заполняемых форм Word (.docx) с настоящими элементами управления содержимым (SDT) + устаревшими флажками полей форм + плейсхолдерами слияния MERGEFIELD + защитой документа. Триггеры: «заполняемая форма», «поля формы», «элементы управления содержимым», «SDT», «форма Word», «заполнить», «только редактируемые поля», «защитить документ», «форма для новичков», «сбор данных HR», «шаблон опроса», «шаблон контракта / SOW», «шаблон слияния», «чек-лист соответствия», «медицинская анкета». Результат — один .docx, в котором конкретные поля редактируемы, а остальное заблокировано. Этот навык НЕЗАВИСИМ и не является сценарным слоем поверх docx — нагрузка — это `<w:sdt>` + `<w:ffData>` + `<w:fldChar>` + `documentProtection`, ни один из которых не покрывает базовый навык docx. НЕ активируйте для обычных отчётов, писем, служебных записок, научных работ, питч-деков или любых документов без заполняемых полей — направляйте их на officecli-docx или его сценарные слои.',
    'uk-UA':
      'Використовуйте цей скіл для створення заповнюваних форм Word (.docx) зі справжніми елементами керування вмістом (SDT) + застарілими прапорцями полів форм + плейсхолдерами злиття MERGEFIELD + захистом документа. Тригери: «заповнювана форма», «поля форми», «елементи керування вмістом», «SDT», «форма Word», «заповнити», «лише редаговані поля», «захистити документ», «форма для новачків», «збір даних HR», «шаблон опитування», «шаблон контракту / SOW», «шаблон злиття», «чек-лист відповідності», «медична анкета». Результат — один .docx, у якому конкретні поля редаговані, а решта заблокована. Цей скіл НЕЗАЛЕЖНИЙ і не є сценарним шаром поверх docx — навантаження — це `<w:sdt>` + `<w:ffData>` + `<w:fldChar>` + `documentProtection`, жоден з яких не покриває базовий скіл docx. НЕ активуйте для звичайних звітів, листів, службових записок, наукових робіт, пітч-деків або будь-яких документів без заповнюваних полів — спрямовуйте їх на officecli-docx або його сценарні шари.',
    'tr-TR':
      'Gerçek İçerik Denetimleri (SDT) + eski Form Alanı onay kutuları + MERGEFIELD adres-mektup birleştirme yer tutucuları + belge koruması içeren doldurulabilir Word formları (.docx) oluşturmak için bu beceriyi kullanın. Tetikleyiciler: "doldurulabilir form", "form alanları", "içerik denetimleri", "SDT", "Word formu", "doldur", "yalnızca düzenlenebilir alanlar", "belgeyi koru", "işe alım formu", "İK girişi", "anket şablonu", "sözleşme / SOW şablonu", "adres-mektup birleştirme şablonu", "uyum kontrol listesi", "tıbbi kabul anketi". Çıktı, belirli alanların düzenlenebilir ve geri kalanının kilitli olduğu tek bir .docx dosyasıdır. Bu beceri BAĞIMSIZDIR, docx üzerinde bir sahne katmanı değildir — yük `<w:sdt>` + `<w:ffData>` + `<w:fldChar>` + `documentProtection` içerir ve bunların hiçbiri docx temel becerisinin kapsamında değildir. Normal raporlar, mektuplar, notlar, akademik makaleler, pitch deck\'ler veya kullanıcı tarafından doldurulabilir alanı olmayan belgeler için tetiklemeyin — bunları officecli-docx\'e veya sahne katmanlarına yönlendirin.',
    'fa-IR':
      'برای ایجاد فرمهای قابل پر کردن Word (.docx) با کنترلهای محتوای واقعی (SDT) + چکباکسهای فیلد فرم قدیمی + جاینگهدارهای ادغام نامه MERGEFIELD + محافظت از سند استفاده کنید. محرکها: «فرم قابل پر کردن»، «فیلدهای فرم»، «کنترلهای محتوا»، «SDT»، «فرم Word»، «پر کردن»، «فقط فیلدهای قابل ویرایش»، «محافظت از سند»، «فرم استخدام»، «دریافت منابع انسانی»، «قالب نظرسنجی»، «قالب قرارداد/SOW»، «قالب ادغام نامه»، «چکلیست انطباق»، «پرسشنامه پذیرش پزشکی». خروجی یک فایل .docx است که فیلدهای مشخص قابل ویرایش و بقیه قفل هستند. این اسکیل مستقل است و لایه صحنه روی docx نیست — محتوای آن `<w:sdt>` + `<w:ffData>` + `<w:fldChar>` + `documentProtection` است که هیچکدام در اسکیل پایه docx پوشش داده نمیشوند. برای گزارشهای معمولی، نامهها، یادداشتها، مقالات آکادمیک، پیتچدک یا هر سندی بدون فیلد قابل پر کردن فعال نکنید — آنها را به officecli-docx یا لایههای صحنه آن هدایت کنید.',
  },
  'officecli-xlsx': {
    'en-US':
      'Use this skill any time a .xlsx file is involved -- as input, output, or both. This includes: creating spreadsheets, financial models, dashboards, or trackers; reading, parsing, or extracting data from any .xlsx file; editing, modifying, or updating existing workbooks; working with formulas, charts, pivot tables, or templates; importing CSV/TSV data into Excel format. Trigger whenever the user mentions "spreadsheet", "workbook", "Excel", "financial model", "tracker", "dashboard", or references a .xlsx/.csv filename.',
    'zh-CN':
      '只要涉及 .xlsx 文件（作为输入、输出或两者皆是）就使用本技能。包括：创建电子表格、财务模型、仪表盘或追踪表；读取、解析或提取任何 .xlsx 文件中的数据；编辑、修改或更新现有工作簿；处理公式、图表、数据透视表或模板；将 CSV/TSV 数据导入 Excel 格式。只要用户提到"电子表格"、"工作簿"、"Excel"、"财务模型"、"追踪表"、"仪表盘"或引用 .xlsx/.csv 文件名就触发。',
    'zh-TW':
      '只要涉及 .xlsx 檔案（作為輸入、輸出或兩者皆是）就使用本技能。包括：建立試算表、財務模型、儀表板或追蹤表；讀取、解析或擷取任何 .xlsx 檔案中的資料；編輯、修改或更新現有活頁簿；處理公式、圖表、樞紐分析表或範本；將 CSV/TSV 資料匯入 Excel 格式。只要使用者提到「試算表」、「活頁簿」、「Excel」、「財務模型」、「追蹤表」、「儀表板」或引用 .xlsx/.csv 檔案名稱就觸發。',
    'ja-JP':
      '.xlsxファイルが関わる場合（入力、出力、またはその両方）はいつでもこのスキルを使用します。スプレッドシート、財務モデル、ダッシュボード、トラッカーの作成；任意の.xlsxファイルからのデータの読み取り、解析、抽出；既存ワークブックの編集、修正、更新；数式、チャート、ピボットテーブル、テンプレートの処理；CSV/TSVデータのExcel形式へのインポートを含みます。ユーザーが「スプレッドシート」、「ワークブック」、「Excel」、「財務モデル」、「トラッカー」、「ダッシュボード」に言及したり、.xlsx/.csvファイル名を参照したりしたときにトリガーします。',
    'ko-KR':
      '.xlsx 파일이 입력, 출력 또는 둘 다로 포함될 때마다 이 스킬을 사용합니다. 여기에는 스프레드시트, 재무 모델, 대시보드 또는 트래커 만들기; 모든 .xlsx 파일에서 데이터 읽기, 파싱 또는 추출; 기존 통합 문서 편집, 수정 또는 업데이트; 수식, 차트, 피벗 테이블 또는 템플릿 작업; CSV/TSV 데이터를 Excel 형식으로 가져오기가 포함됩니다. 사용자가 "스프레드시트", "통합 문서", "Excel", "재무 모델", "트래커", "대시보드"를 언급하거나 .xlsx/.csv 파일 이름을 참조할 때 트리거합니다.',
    'de-DE':
      'Verwenden Sie diesen Skill immer dann, wenn eine .xlsx-Datei beteiligt ist — als Eingabe, Ausgabe oder beides. Dazu gehören: Erstellen von Tabellenkalkulationen, Finanzmodellen, Dashboards oder Trackern; Lesen, Parsen oder Extrahieren von Daten aus beliebigen .xlsx-Dateien; Bearbeiten, Ändern oder Aktualisieren vorhandener Arbeitsmappen; Arbeiten mit Formeln, Diagrammen, Pivot-Tabellen oder Vorlagen; Importieren von CSV/TSV-Daten in Excel-Format. Auslösen, wenn der Benutzer "Tabellenkalkulation", "Arbeitsmappe", "Excel", "Finanzmodell", "Tracker", "Dashboard" erwähnt oder eine .xlsx/.csv-Datei referenziert.',
    'es-ES':
      'Usa este skill siempre que intervenga un archivo .xlsx, ya sea como entrada, salida o ambos. Incluye: crear hojas de cálculo, modelos financieros, dashboards o rastreadores; leer, analizar o extraer datos de cualquier archivo .xlsx; editar, modificar o actualizar libros de trabajo existentes; trabajar con fórmulas, gráficos, tablas dinámicas o plantillas; importar datos CSV/TSV a formato Excel. Activa cuando el usuario mencione "hoja de cálculo", "libro de trabajo", "Excel", "modelo financiero", "rastreador", "dashboard" o haga referencia a un nombre de archivo .xlsx/.csv.',
    'fr-FR':
      'Utilisez ce skill chaque fois qu’un fichier .xlsx est impliqué — en entrée, en sortie ou les deux. Cela inclut : créer des feuilles de calcul, des modèles financiers, des tableaux de bord ou des suivis ; lire, analyser ou extraire des données de n’importe quel fichier .xlsx ; modifier, mettre à jour des classeurs existants ; travailler avec des formules, des graphiques, des tableaux croisés dynamiques ou des modèles ; importer des données CSV/TSV au format Excel. Déclenchez lorsque l’utilisateur mentionne « feuille de calcul », « classeur », « Excel », « modèle financier », « suivi », « tableau de bord » ou fait référence à un nom de fichier .xlsx/.csv.',
    'pt-BR':
      'Use este skill sempre que um arquivo .xlsx estiver envolvido — como entrada, saída ou ambos. Isso inclui: criar planilhas, modelos financeiros, dashboards ou rastreadores; ler, analisar ou extrair dados de qualquer arquivo .xlsx; editar, modificar ou atualizar pastas de trabalho existentes; trabalhar com fórmulas, gráficos, tabelas dinâmicas ou modelos; importar dados CSV/TSV para o formato Excel. Dispare quando o usuário mencionar "planilha", "pasta de trabalho", "Excel", "modelo financeiro", "rastreador", "dashboard" ou fizer referência a um nome de arquivo .xlsx/.csv.',
    'ru-RU':
      'Используйте этот навык всегда, когда задействован файл .xlsx — как входные данные, выходные или оба. Это включает: создание электронных таблиц, финансовых моделей, дашбордов или трекеров; чтение, разбор или извлечение данных из любых файлов .xlsx; редактирование, изменение или обновление существующих книг; работу с формулами, диаграммами, сводными таблицами или шаблонами; импорт данных CSV/TSV в формат Excel. Активируйте, когда пользователь упоминает «электронную таблицу», «книгу», «Excel», «финансовую модель», «трекер», «дашборд» или ссылается на имя файла .xlsx/.csv.',
    'uk-UA':
      'Використовуйте цей скіл завжди, коли задіяно файл .xlsx — як вхідні дані, вихідні чи обидва. Це включає: створення електронних таблиць, фінансових моделей, дашбордів або трекерів; читання, розбір або вилучення даних із будь-яких файлів .xlsx; редагування, змінення або оновлення наявних книг; роботу з формулами, діаграмами, зведеними таблицями або шаблонами; імпорт даних CSV/TSV у формат Excel. Активуйте, коли користувач згадує «електронну таблицю», «книгу», «Excel», «фінансову модель», «трекер», «дашборд» або посилається на ім’я файлу .xlsx/.csv.',
    'tr-TR':
      '.xlsx dosyası girdi, çıktı veya her ikisi olarak dahil olduğunda her zaman bu beceriyi kullanın. Bu şunları içerir: elektronik tablolar, finansal modeller, panolar veya takipçiler oluşturmak; herhangi bir .xlsx dosyasından veri okumak, ayrıştırmak veya çıkarmak; mevcut çalışma kitaplarını düzenlemek, değiştirmek veya güncellemek; formüller, grafikler, pivot tablolar veya şablonlarla çalışmak; CSV/TSV verilerini Excel biçimine aktarmak. Kullanıcı "elektronik tablo", "çalışma kitabı", "Excel", "finansal model", "takipçi", "pano" ifadelerini kullandığında veya bir .xlsx/.csv dosya adına atıfta bulunduğunda tetikleyin.',
    'fa-IR':
      'هر زمان که فایل .xlsx درگیر باشد — بهعنوان ورودی، خروجی یا هر دو — از این اسکیل استفاده کنید. این شامل: ایجاد صفحات گسترده، مدلهای مالی، داشبوردها یا ردیابها؛ خواندن، تجزیه یا استخراج داده از هر فایل .xlsx؛ ویرایش، اصلاح یا بهروزرسانی کتابهای کار موجود؛ کار با فرمولها، نمودارها، جدولهای محوری یا قالبها؛ وارد کردن داده CSV/TSV به فرمت Excel است. هر زمان که کاربر «صفحه گسترده»، «کتاب کار»، «Excel»، «مدل مالی»، «ردیاب»، «داشبورد» را ذکر کرد یا به نام فایل .xlsx/.csv اشاره کرد، فعال کنید.',
  },
  'openclaw-setup': {
    'en-US':
      'OpenClaw usage expert: Helps you install, deploy, configure, and use OpenClaw personal AI assistant. Can diagnose issues, create bots, execute automated tasks, etc. Use when users need to install OpenClaw, configure Gateway, set up Channels, create Agents, troubleshoot issues, or perform OpenClaw-related operations.',
    'zh-CN':
      'OpenClaw 使用专家：帮助您安装、部署、配置和使用 OpenClaw 个人 AI 助手。可以诊断问题、创建机器人、执行自动化任务等。当用户需要安装 OpenClaw、配置 Gateway、设置 Channels、创建 Agents、排查问题或执行 OpenClaw 相关操作时使用。',
    'zh-TW':
      'OpenClaw 使用專家：幫助您安裝、部署、設定與使用 OpenClaw 個人 AI 助手。可以診斷問題、建立機器人、執行自動化任務等。當使用者需要安裝 OpenClaw、設定 Gateway、設定 Channels、建立 Agents、排除問題或執行 OpenClaw 相關操作時使用。',
    'ja-JP':
      'OpenClaw使用のエキスパート：個人用AIアシスタントOpenClawのインストール、デプロイ、設定、利用を支援します。問題の診断、ボットの作成、自動タスクの実行などが可能です。ユーザーがOpenClawのインストール、Gatewayの設定、Channelsのセットアップ、Agentsの作成、問題のトラブルシューティング、またはOpenClaw関連の操作を必要とするときに使用します。',
    'ko-KR':
      'OpenClaw 사용 전문가: 개인 AI 어시스턴트 OpenClaw의 설치, 배포, 구성 및 사용을 도와줍니다. 문제 진단, 봇 생성, 자동화된 작업 실행 등이 가능합니다. 사용자가 OpenClaw를 설치하거나, Gateway를 구성하거나, Channels를 설정하거나, Agents를 만들거나, 문제를 해결하거나, OpenClaw 관련 작업을 수행해야 할 때 사용합니다.',
    'de-DE':
      'Experte für OpenClaw-Nutzung: hilft bei Installation, Bereitstellung, Konfiguration und Verwendung des persönlichen KI-Assistenten OpenClaw. Kann Probleme diagnostizieren, Bots erstellen, automatisierte Aufgaben ausführen usw. Verwenden Sie dies, wenn Benutzer OpenClaw installieren, Gateway konfigurieren, Channels einrichten, Agents erstellen, Probleme beheben oder OpenClaw-bezogene Operationen durchführen müssen.',
    'es-ES':
      'Experto en el uso de OpenClaw: te ayuda a instalar, desplegar, configurar y usar el asistente personal de IA OpenClaw. Puede diagnosticar problemas, crear bots, ejecutar tareas automatizadas, etc. Úsalo cuando los usuarios necesiten instalar OpenClaw, configurar Gateway, crear Channels, crear Agents, solucionar problemas o realizar operaciones relacionadas con OpenClaw.',
    'fr-FR':
      'Expert en utilisation d’OpenClaw : aide à installer, déployer, configurer et utiliser l’assistant personnel IA OpenClaw. Peut diagnostiquer des problèmes, créer des bots, exécuter des tâches automatisées, etc. À utiliser lorsque les utilisateurs doivent installer OpenClaw, configurer Gateway, créer des Channels, créer des Agents, résoudre des problèmes ou effectuer des opérations liées à OpenClaw.',
    'pt-BR':
      'Especialista no uso do OpenClaw: ajuda a instalar, implantar, configurar e usar o assistente pessoal de IA OpenClaw. Pode diagnosticar problemas, criar bots, executar tarefas automatizadas etc. Use quando os usuários precisarem instalar o OpenClaw, configurar o Gateway, criar Channels, criar Agents, solucionar problemas ou realizar operações relacionadas ao OpenClaw.',
    'ru-RU':
      'Эксперт по использованию OpenClaw: помогает устанавливать, развёртывать, настраивать и использовать персонального ИИ-ассистента OpenClaw. Может диагностировать проблемы, создавать ботов, выполнять автоматизированные задачи и т. д. Используйте, когда пользователям нужно установить OpenClaw, настроить Gateway, настроить Channels, создать Agents, устранить проблемы или выполнить операции, связанные с OpenClaw.',
    'uk-UA':
      'Експерт із використання OpenClaw: допомагає встановлювати, розгортати, налаштовувати та використовувати персонального ІІ-асистента OpenClaw. Може діагностувати проблеми, створювати ботів, виконувати автоматизовані завдання тощо. Використовуйте, коли користувачам потрібно встановити OpenClaw, налаштувати Gateway, налаштувати Channels, створити Agents, усунути проблеми або виконати операції, пов’язані з OpenClaw.',
    'tr-TR':
      "OpenClaw kullanım uzmanı: kişisel yapay zekâ asistanı OpenClaw'ı kurmanıza, dağıtmanıza, yapılandırmanıza ve kullanmanıza yardımcı olur. Sorunları teşhis edebilir, botlar oluşturabilir, otomatik görevler çalıştırabilir vb. Kullanıcıların OpenClaw kurması, Gateway yapılandırması, Channels kurması, Agents oluşturması, sorunları gidermesi veya OpenClaw ile ilgili işlemler yapması gerektiğinde kullanın.",
    'fa-IR':
      'متخصص استفاده از OpenClaw: به شما در نصب، استقرار، پیکربندی و استفاده از دستیار شخصی هوش مصنوعی OpenClaw کمک میکند. میتواند مشکلات را تشخیص دهد، ربات بسازد، وظایف خودکار اجرا کند و غیره. زمانی استفاده کنید که کاربران نیاز به نصب OpenClaw، پیکربندی Gateway، راهاندازی Channels، ایجاد Agents، رفع مشکلات یا انجام عملیات مرتبط با OpenClaw دارند.',
  },
  pdf: {
    'en-US':
      'Comprehensive PDF manipulation toolkit for extracting text and tables, creating new PDFs, merging/splitting documents, and handling forms. When Claude needs to fill in a PDF form or programmatically process, generate, or analyze PDF documents at scale.',
    'zh-CN':
      '全面的 PDF 处理工具包：支持提取文本和表格、创建新 PDF、合并/拆分文档以及处理表单。当 Claude 需要填写 PDF 表单，或以编程方式批量处理、生成或分析 PDF 文档时使用。',
    'zh-TW':
      '全面的 PDF 處理工具包：支援擷取文字和表格、建立新 PDF、合併/分割文件以及處理表單。當 Claude 需要填寫 PDF 表單，或以程式化方式批次處理、產生或分析 PDF 文件時使用。',
    'ja-JP':
      'テキストと表の抽出、新しいPDFの作成、ドキュメントの結合/分割、フォーム処理のための包括的なPDF操作ツールキットです。ClaudeがPDFフォームへの入力や、PDF文書のプログラムによる処理、生成、大規模な分析を行う必要がある場合に使用します。',
    'ko-KR':
      '텍스트와 표 추출, 새 PDF 생성, 문서 병합/분할, 양식 처리를 위한 종합적인 PDF 조작 도구 키트입니다. Claude가 PDF 양식을 작성하거나 PDF 문서를 프로그래밍 방식으로 처리, 생성 또는 대규모로 분석해야 할 때 사용합니다.',
    'de-DE':
      'Umfassendes PDF-Werkzeugpaket zum Extrahieren von Text und Tabellen, Erstellen neuer PDFs, Zusammenführen/Teilen von Dokumenten und Verarbeiten von Formularen. Verwenden Sie dies, wenn Claude ein PDF-Formular ausfüllen oder PDF-Dokumente programmatisch in großem Umfang verarbeiten, erzeugen oder analysieren muss.',
    'es-ES':
      'Kit integral de manipulación de PDF para extraer texto y tablas, crear nuevos PDF, fusionar/dividir documentos y manejar formularios. Úsalo cuando Claude necesite rellenar un formulario PDF o procesar, generar o analizar documentos PDF programáticamente a escala.',
    'fr-FR':
      'Boîte à outils complète de manipulation de PDF pour extraire du texte et des tableaux, créer de nouveaux PDF, fusionner/scinder des documents et gérer des formulaires. À utiliser lorsque Claude doit remplir un formulaire PDF ou traiter, générer ou analyser des documents PDF par programmation à grande échelle.',
    'pt-BR':
      'Kit abrangente de manipulação de PDF para extrair texto e tabelas, criar novos PDFs, mesclar/dividir documentos e lidar com formulários. Use quando o Claude precisar preencher um formulário PDF ou processar, gerar ou analisar documentos PDF programaticamente em escala.',
    'ru-RU':
      'Комплексный набор инструментов для работы с PDF: извлечение текста и таблиц, создание новых PDF, объединение/разделение документов и обработка форм. Используйте, когда Claude нужно заполнить PDF-форму или программно обрабатывать, создавать или анализировать PDF-документы в больших объёмах.',
    'uk-UA':
      'Комплексний набір інструментів для роботи з PDF: вилучення тексту й таблиць, створення нових PDF, об’єднання/розділення документів та обробка форм. Використовуйте, коли Claude потрібно заповнити PDF-форму або програмно обробляти, створювати чи аналізувати PDF-документи у великих обсягах.',
    'tr-TR':
      "Metin ve tablo çıkarma, yeni PDF oluşturma, belgeleri birleştirme/bölme ve form işleme için kapsamlı bir PDF işleme araç setidir. Claude'ın bir PDF formunu doldurması veya PDF belgelerini programatik olarak ölçekli şekilde işlemesi, oluşturması ya da analiz etmesi gerektiğinde kullanın.",
    'fa-IR':
      'مجموعه ابزار جامع دستکاری PDF برای استخراج متن و جدول، ایجاد PDF جدید، ادغام/تقسیم اسناد و مدیریت فرمها. زمانی استفاده کنید که Claude نیاز به پر کردن فرم PDF یا پردازش، تولید یا تحلیل برنامهنویسیشده اسناد PDF در مقیاس بزرگ دارد.',
  },
  'story-roleplay': {
    'en-US':
      'Parse and apply character cards and world info files in multiple formats (PNG, WebP, JSON), fully compatible with SillyTavern format. Supports automatic parsing, keyword triggering, and dynamic updates.',
    'zh-CN':
      '解析并应用多种格式（PNG、WebP、JSON）的角色卡与世界设定文件，完全兼容 SillyTavern 格式。支持自动解析、关键词触发和动态更新。',
    'zh-TW':
      '解析並套用多種格式（PNG、WebP、JSON）的角色卡與世界設定檔案，完全相容 SillyTavern 格式。支援自動解析、關鍵字觸發與動態更新。',
    'ja-JP':
      '複数の形式（PNG、WebP、JSON）のキャラクターカードとワールド情報ファイルを解析して適用します。SillyTavern形式と完全互換です。自動解析、キーワードトリガー、動的更新に対応しています。',
    'ko-KR':
      '여러 형식(PNG, WebP, JSON)의 캐릭터 카드와 월드 정보 파일을 파싱하고 적용합니다. SillyTavern 형식과 완전히 호환됩니다. 자동 파싱, 키워드 트리거, 동적 업데이트를 지원합니다.',
    'de-DE':
      'Analysiert und wendet Charakterkarten und Weltinfo-Dateien in mehreren Formaten (PNG, WebP, JSON) an, vollständig kompatibel mit dem SillyTavern-Format. Unterstützt automatisches Parsen, Schlüsselwort-Auslösung und dynamische Updates.',
    'es-ES':
      'Analiza y aplica tarjetas de personaje y archivos de información del mundo en múltiples formatos (PNG, WebP, JSON), totalmente compatible con el formato SillyTavern. Admite análisis automático, activación por palabras clave y actualizaciones dinámicas.',
    'fr-FR':
      'Analyse et applique des fiches de personnage et des fichiers d’informations sur le monde dans plusieurs formats (PNG, WebP, JSON), entièrement compatible avec le format SillyTavern. Prend en charge l’analyse automatique, le déclenchement par mots-clés et les mises à jour dynamiques.',
    'pt-BR':
      'Analisa e aplica cartões de personagem e arquivos de informações de mundo em vários formatos (PNG, WebP, JSON), totalmente compatível com o formato SillyTavern. Suporta análise automática, acionamento por palavras-chave e atualizações dinâmicas.',
    'ru-RU':
      'Разбор и применение карточек персонажей и файлов мировой информации в нескольких форматах (PNG, WebP, JSON), полностью совместимо с форматом SillyTavern. Поддерживает автоматический разбор, активацию по ключевым словам и динамическое обновление.',
    'uk-UA':
      'Розбір і застосування карток персонажів і файлів світової інформації в кількох форматах (PNG, WebP, JSON), повністю сумісно з форматом SillyTavern. Підтримує автоматичний розбір, активацію за ключовими словами та динамічне оновлення.',
    'tr-TR':
      'Birden çok formattaki (PNG, WebP, JSON) karakter kartlarını ve dünya bilgisi dosyalarını ayrıştırıp uygular; SillyTavern formatıyla tam uyumludur. Otomatik ayrıştırmayı, anahtar kelime tetiklemeyi ve dinamik güncellemeleri destekler.',
    'fa-IR':
      'کارتهای شخصیت و فایلهای اطلاعات دنیا را در قالبهای متعدد (PNG، WebP، JSON) تجزیه و اعمال میکند؛ کاملاً سازگار با فرمت SillyTavern. از تجزیه خودکار، فعالسازی با کلمه کلیدی و بهروزرسانی پویا پشتیبانی میکند.',
  },
  'weixin-file-send': {
    'en-US': 'Use when the user wants a local file or image sent back, such as "send me the file" or "发给我".',
    'zh-CN': '当用户想把本地文件或图片发回，例如"把文件发给我"或"发给我"时使用。',
    'zh-TW': '當使用者想把本機檔案或圖片發回，例如「把檔案傳給我」或「傳給我」時使用。',
    'ja-JP':
      'ユーザーがローカルファイルや画像を送り返してほしい場合（「ファイルを送って」「送って」など）に使用します。',
    'ko-KR': '사용자가 로컬 파일이나 이미지를 다시 보내주길 원할 때(예: "파일 보내줘", "보내줘") 사용합니다.',
    'de-DE':
      'Verwenden Sie dies, wenn der Benutzer eine lokale Datei oder ein Bild zurückgesendet haben möchte, z. B. "Schicken Sie mir die Datei" oder "Schick mir die Datei".',
    'es-ES':
      'Úsalo cuando el usuario quiera que se le devuelva un archivo o imagen local, por ejemplo "mándame el archivo" o "pásame el archivo".',
    'fr-FR':
      'À utiliser lorsque l’utilisateur souhaite qu’un fichier ou une image locale lui soit renvoyé, par exemple « envoie-moi le fichier ».',
    'pt-BR':
      'Use quando o usuário quiser que um arquivo ou imagem local seja enviado de volta, por exemplo "me manda o arquivo" ou "me envia o arquivo".',
    'ru-RU':
      'Используйте, когда пользователь хочет получить обратно локальный файл или изображение, например «отправь мне файл» или «пришли мне файл».',
    'uk-UA':
      'Використовуйте, коли користувач хоче отримати назад локальний файл або зображення, наприклад «надішли мені файл» або «пришли мені файл».',
    'tr-TR':
      'Kullanıcı yerel bir dosyanın veya görselin geri gönderilmesini istediğinde kullanın, örneğin "dosyayı bana gönder" veya "bana gönder".',
    'fa-IR':
      'زمانی استفاده کنید که کاربر میخواهد یک فایل یا تصویر محلی بازگردانده شود، مانند «فایل را برایم بفرست» یا «برام بفرست».',
  },
  'x-recruiter': {
    'en-US':
      'For posting recruiting posts on X (x.com). Includes copywriting guidelines, image-generation prompts, and automated publishing scripts. Use first when posting AI-related or design-related job openings.',
    'zh-CN':
      '用于在 X (x.com) 发布招聘帖子。包含文案规范、图片生成提示和自动化发布脚本。发布 AI 相关岗位或设计类岗位时优先使用。',
    'zh-TW':
      '用於在 X (x.com) 發佈徵才貼文。包含文案規範、圖片生成提示與自動化發佈腳本。發佈 AI 相關職位或設計類職位時優先使用。',
    'ja-JP':
      'X (x.com) で採用投稿を公開するためのスキルです。コピーライティングのガイドライン、画像生成プロンプト、自動公開スクリプトを含みます。AI関連またはデザイン関連の求人を投稿する際に優先的に使用します。',
    'ko-KR':
      'X(x.com)에 채용 게시물을 올리기 위한 스킬입니다. 카피라이팅 가이드라인, 이미지 생성 프롬프트, 자동 게시 스크립트가 포함되어 있습니다. AI 관련 또는 디자인 관련 채용 공고를 올릴 때 우선 사용합니다.',
    'de-DE':
      'Zum Veröffentlichen von Stellenausschreibungen auf X (x.com). Enthält Richtlinien für Texte, Prompts zur Bildgenerierung und Skripte zur automatischen Veröffentlichung. Vorrangig verwenden, wenn KI-bezogene oder designbezogene Stellen ausgeschrieben werden.',
    'es-ES':
      'Para publicar ofertas de empleo en X (x.com). Incluye pautas de redacción, prompts de generación de imágenes y scripts de publicación automatizada. Úsalo preferentemente al publicar vacantes relacionadas con IA o diseño.',
    'fr-FR':
      'Pour publier des offres d’emploi sur X (x.com). Inclut des consignes de rédaction, des invites de génération d’images et des scripts de publication automatisée. À utiliser en priorité pour les postes liés à l’IA ou au design.',
    'pt-BR':
      'Para publicar vagas de emprego no X (x.com). Inclui diretrizes de redação, prompts de geração de imagens e scripts de publicação automatizada. Use primeiro ao publicar vagas relacionadas a IA ou design.',
    'ru-RU':
      'Для публикации вакансий в X (x.com). Включает правила написания текстов, промпты для генерации изображений и скрипты автоматической публикации. Используйте в первую очередь при публикации вакансий, связанных с ИИ или дизайном.',
    'uk-UA':
      'Для публікації вакансій у X (x.com). Включає правила написання текстів, промпти для генерації зображень і скрипти автоматичної публікації. Використовуйте в першу чергу при публікації вакансій, пов’язаних зі ШІ або дизайном.',
    'tr-TR':
      'X (x.com) üzerinde iş ilanı paylaşmak için kullanılır. Metin yazma kuralları, görsel üretim istemleri ve otomatik yayınlama betikleri içerir. Yapay zekâ veya tasarımla ilgili pozisyonlar yayınlanırken öncelikli olarak kullanın.',
    'fa-IR':
      'برای انتشار پستهای استخدام در X (x.com). شامل راهنمای متننویسی، پرامپتهای تولید تصویر و اسکریپتهای انتشار خودکار است. هنگام انتشار موقعیتهای شغلی مرتبط با هوش مصنوعی یا طراحی در اولویت استفاده قرار دهید.',
  },
  'xiaohongshu-recruiter': {
    'en-US':
      'For publishing high-quality AI-related job posts on Xiaohongshu. Includes automated generation of geek-style recruiting cover and detail images, plus automated publishing scripts. Use when users need to post job openings, find Agent designers, or other AI-domain talent.',
    'zh-CN':
      '用于在小红书上发布高质量的 AI 相关岗位招聘帖子。包含自动生成极客风格的招聘封面图和详情图，并提供自动化发布脚本。当用户需要发布招聘信息、寻找 Agent 设计师或其他 AI 领域人才时使用。',
    'zh-TW':
      '用於在小紅書上發佈高品質的 AI 相關職位徵才貼文。包含自動產生極客風格的徵才封面圖與詳情圖，並提供自動化發佈腳本。當使用者需要發佈徵才資訊、尋找 Agent 設計師或其他 AI 領域人才時使用。',
    'ja-JP':
      '小紅書（Xiaohongshu）で高品質なAI関連求人投稿を公開するためのスキルです。ギークスタイルの採用カバー画像と詳細画像の自動生成、自動公開スクリプトを提供します。ユーザーが求人を投稿したり、Agentデザイナーやその他のAI分野の人材を探したりする必要がある場合に使用します。',
    'ko-KR':
      '샤오홍슈(Xiaohongshu)에 고품질 AI 관련 채용 게시물을 게시하기 위한 스킬입니다. 긱 스타일의 채용 커버 이미지와 상세 이미지 자동 생성, 자동 게시 스크립트를 제공합니다. 사용자가 채용 공고를 게시하거나 Agent 디자이너, 기타 AI 분야 인재를 찾아야 할 때 사용합니다.',
    'de-DE':
      'Zum Veröffentlichen hochwertiger KI-bezogener Stellenausschreibungen auf Xiaohongshu. Enthält die automatische Erzeugung von Rekrutierungs-Titel- und Detailbildern im Geek-Stil sowie Skripte zur automatischen Veröffentlichung. Verwenden Sie dies, wenn Benutzer Stellen ausschreiben oder Agent-Designer oder andere Talente im KI-Bereich suchen müssen.',
    'es-ES':
      'Para publicar ofertas de empleo de alta calidad relacionadas con IA en Xiaohongshu. Incluye generación automática de imágenes de portada y detalle de reclutamiento en estilo geek, además de scripts de publicación automatizada. Úsalo cuando los usuarios necesiten publicar vacantes, encontrar diseñadores de Agents u otros talentos del ámbito de la IA.',
    'fr-FR':
      'Pour publier des offres d’emploi de haute qualité liées à l’IA sur Xiaohongshu. Comprend la génération automatisée d’images de couverture et de détail de recrutement style geek, ainsi que des scripts de publication automatisée. À utiliser lorsque les utilisateurs doivent publier des offres, trouver des designers d’Agents ou d’autres talents du domaine de l’IA.',
    'pt-BR':
      'Para publicar vagas de alta qualidade relacionadas a IA no Xiaohongshu. Inclui geração automática de imagens de capa e detalhe de recrutamento em estilo geek, além de scripts de publicação automatizada. Use quando os usuários precisarem publicar vagas, encontrar designers de Agents ou outros talentos da área de IA.',
    'ru-RU':
      'Для публикации качественных вакансий, связанных с ИИ, в Xiaohongshu. Включает автоматическую генерацию изображений обложки и деталей для рекрутинга в стиле гик, а также скрипты автоматической публикации. Используйте, когда пользователям нужно публиковать вакансии, найти дизайнеров Agents или других специалистов в области ИИ.',
    'uk-UA':
      'Для публікації якісних вакансій, пов’язаних зі ШІ, у Xiaohongshu. Включає автоматичну генерацію зображень обкладинки й деталей для рекрутингу в стилі гік, а також скрипти автоматичної публікації. Використовуйте, коли користувачам потрібно публікувати вакансії, знайти дизайнерів Agents або інших спеціалістів у галузі ШІ.',
    'tr-TR':
      "Xiaohongshu'da yüksek kaliteli yapay zekâ ile ilgili iş ilanları yayınlamak için kullanılır. Geek tarzı işe alım kapak ve detay görsellerinin otomatik üretimini ve otomatik yayınlama betiklerini içerir. Kullanıcıların iş ilanı yayınlaması, Agent tasarımcıları veya diğer yapay zekâ alanı yeteneklerini bulması gerektiğinde kullanın.",
    'fa-IR':
      'برای انتشار پستهای استخدام باکیفیت مرتبط با هوش مصنوعی در شیائوهونگشو. شامل تولید خودکار تصویر کاور و تصاویر جزئیات استخدام با سبک گیک، و اسکریپتهای انتشار خودکار است. زمانی استفاده کنید که کاربران نیاز به انتشار آگهی استخدام، یافتن طراح Agent یا سایر استعدادهای حوزه هوش مصنوعی دارند.',
  },
};

export const getOfficialSkillDescriptions = (skillName: string): OfficialSkillDescriptions | undefined =>
  OFFICIAL_SKILL_DESCRIPTIONS[skillName];

/** Localized description for a skill in the current UI locale (falls back to canonical English). */
export const getSkillDescriptionForLocale = (skillName: string, locale: string): string | undefined => {
  const descriptions = OFFICIAL_SKILL_DESCRIPTIONS[skillName];
  if (!descriptions) return undefined;
  return descriptions[resolveLocaleKey(locale)];
};

/** Canonical English description used for the hover tooltip (English original). */
export const getSkillDescriptionEnglish = (skillName: string): string | undefined =>
  OFFICIAL_SKILL_DESCRIPTIONS[skillName]?.['en-US'];
