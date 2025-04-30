def diagnostico_cnpj(data):
    cnpj = data.get('cnpj')
    return {
        'situacao_cadastral': 'Ativa',
        'texto_situacao': 'CNPJ ativo com guias em aberto.',
        'divida_ativa': True,
        'texto_divida': 'Dívida ativa identificada.',
        'declaracao_anual': True,
        'texto_declaracao': 'Declaração anual em atraso.',
        'demais_guias': True,
        'texto_guias': 'Guias mensais não quitadas.',
        'enquadramento': 'SIMEI',
        'texto_enquadramento': 'Ainda enquadrado como MEI.',
        'proposta': 'Parcelamento por R$ 349. Deseja regularizar agora?'
    }
