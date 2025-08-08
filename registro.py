# registro.py
from flask import jsonify
import datetime
import os
import logging

logger = logging.getLogger(__name__)

TOKEN_SECRETO = "CNPJLegalToken01"

def registrar_cnpj(request):
    # Autenticação via token
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer ") or auth.split(" ")[1] != TOKEN_SECRETO:
        logger.warning("Tentativa de acesso não autorizada ao registrar CNPJ.")
        return jsonify({"status": "erro", "mensagem": "Não autorizado."}), 401

    data = request.get_json(force=True)
    cnpj = data.get("cnpj", "").strip()
    origem = data.get("origem", "web")
    ip = request.remote_addr
    timestamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    if not cnpj.isdigit() or len(cnpj) != 14:
        logger.warning(f"CNPJ inválido recebido para registro: {cnpj}")
        return jsonify({"status": "erro", "mensagem": "CNPJ inválido."}), 400

    # Apenas registra no log, já que não estamos usando Google Sheets
    logger.info(f"[MODO SIMULADO] Registro de CNPJ: {cnpj}, IP: {ip}, Origem: {origem}, Horário: {timestamp}")
    return jsonify({"status": "sucesso", "mensagem": "Registro simulado. Google Sheets não configurado."})
