# registro.py
from flask import jsonify
import datetime
import gspread
import os
import json
import logging
from google.oauth2.service_account import Credentials

logger = logging.getLogger(__name__)

TOKEN_SECRETO = "CNPJLegalToken01"
PLANILHA_NOME = "ConsultasCNPJ"
SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
]

# Autenticação com Google Sheets
try:
    creds_json = os.environ.get("GOOGLE_CREDENTIALS_JSON")
    if not creds_json:
        raise ValueError("Variável de ambiente GOOGLE_CREDENTIALS_JSON não configurada.")

    info = json.loads(creds_json)
    creds = Credentials.from_service_account_info(info, scopes=SCOPES)
    gc = gspread.authorize(creds)
    sheet = gc.open(PLANILHA_NOME).sheet1
    logger.info("Conexão com Google Sheets estabelecida.")
except Exception as e:
    logger.error(f"Erro ao inicializar conexão com Google Sheets: {e}")
    sheet = None

def registrar_cnpj(request):
    # Autenticação simples via token
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

    if not sheet:
        logger.error("Google Sheets não inicializado. Registro não efetuado.")
        return jsonify({"status": "erro", "mensagem": "Serviço de registro indisponível."}), 500

    try:
        sheet.append_row([timestamp, cnpj, ip, origem], value_input_option="RAW")
        logger.info(f"CNPJ {cnpj} registrado com sucesso na planilha.")
        return jsonify({"status": "sucesso"})
    except Exception as e:
        logger.error(f"Erro ao registrar CNPJ: {e}")
        return jsonify({"status": "erro", "mensagem": str(e)}), 500
