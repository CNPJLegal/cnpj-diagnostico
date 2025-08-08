# registro.py
from flask import jsonify
import datetime
import os
import json
import logging

# Só tenta importar gspread/google-auth se estiverem instalados
try:
    import gspread
    from google.oauth2.service_account import Credentials
except ImportError:
    gspread = None
    Credentials = None

logger = logging.getLogger(__name__)

TOKEN_SECRETO = "CNPJLegalToken01"
PLANILHA_NOME = "ConsultasCNPJ"
SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
]

sheet = None

# Conecta ao Google Sheets somente se as libs e credenciais existirem
if gspread and Credentials:
    try:
        creds_json = os.environ.get("GOOGLE_CREDENTIALS_JSON")
        if creds_json:
            info = json.loads(creds_json)
            creds = Credentials.from_service_account_info(info, scopes=SCOPES)
            gc = gspread.authorize(creds)
            sheet = gc.open(PLANILHA_NOME).sheet1
            logger.info("Conexão com Google Sheets estabelecida.")
        else:
            logger.warning("Variável GOOGLE_CREDENTIALS_JSON não configurada. Usando modo simulado.")
    except Exception as e:
        logger.error(f"Erro ao inicializar conexão com Google Sheets: {e}")
else:
    logger.warning("Bibliotecas gspread/google-auth não instaladas. Usando modo simulado.")

def registrar_cnpj(request):
    # Autenticação por token simples
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer ") or auth.split(" ")[1] != TOKEN_SECRETO:
        logger.warning("Tentativa de acesso não autorizada ao registrar CNPJ.")
        return jsonify({"status": "erro", "mensagem": "Não autorizado."}), 401

    data = request.get_json(force=True)
    cnpj = data.get("cnpj", "").strip()
    origem = data.get("origem", "web")
    ip = request.remote_addr
    timestamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    # Validação simples do CNPJ
    if not cnpj.isdigit() or len(cnpj) != 14:
        logger.warning(f"CNPJ inválido recebido para registro: {cnpj}")
        return jsonify({"status": "erro", "mensagem": "CNPJ inválido."}), 400

    # Modo simulado caso Google Sheets não esteja configurado
    if not sheet:
        logger.info(f"[MODO SIMULADO] Registro: {timestamp} | CNPJ: {cnpj} | IP: {ip} | Origem: {origem}")
        return jsonify({"status": "sucesso", "mensagem": "Registro simulado. Google Sheets não configurado."})

    # Se planilha estiver disponível, salva nela
    try:
        sheet.append_row([timestamp, cnpj, ip, origem], value_input_option="RAW")
        logger.info(f"CNPJ {cnpj} registrado com sucesso na planilha.")
        return jsonify({"status": "sucesso"})
    except Exception as e:
        logger.error(f"Erro ao registrar CNPJ: {e}")
        return jsonify({"status": "erro", "mensagem": str(e)}), 500
