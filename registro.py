from flask import jsonify
import datetime
import gspread
from google.oauth2.service_account import Credentials

TOKEN_SECRETO = "CNPJLegalToken01"
PLANILHA_NOME = "ConsultasCNPJ"
SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
creds = Credentials.from_service_account_file("first-fuze-439015-u3-987b142213f1.json", scopes=SCOPES)
gc = gspread.authorize(creds)
sheet = gc.open(PLANILHA_NOME).sheet1

def registrar_cnpj(request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer ") or auth.split(" ")[1] != TOKEN_SECRETO:
        return jsonify({"status": "erro", "mensagem": "Não autorizado."}), 401

    data = request.get_json()
    cnpj = data.get("cnpj")
    origem = data.get("origem", "web")
    ip = request.remote_addr
    timestamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    try:
        sheet.append_row([timestamp, cnpj, ip, origem])
        return jsonify({"status": "sucesso"})
    except Exception as e:
        return jsonify({"status": "erro", "mensagem": str(e)}), 500
