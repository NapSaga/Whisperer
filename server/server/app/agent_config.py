import json
import os

from agents import Agent, function_tool

from whisperer.connectors import load_connector

# The per-client connector behind the agent's tools. Swap it without touching the
# agent by setting WHISPERER_API_CONNECTOR (default: the api_shopdemo fixtures).
client_api = load_connector()

STYLE_INSTRUCTIONS = "Use a conversational tone and write in a chat style without formal formatting or lists and do not use any emojis."

# ---------------------------------------------------------------- ShopDemo profile
# Shared base prompt — used identically by base and suggeritore. Keep it generic and
# injection-friendly: it bakes in NO caller-specific facts (no recipient, product, dates,
# or delivery details). The agent starts knowing nothing about this particular order;
# everything it knows must come from the conversation (the layer prepends live state).
SUPPORT_INSTRUCTIONS = (
    "You are a phone customer-support agent for ShopDemo, an online store. "
    "You are on a long voice call helping the caller with one of their existing orders. "
    "Be warm and patient, but keep every reply to one or two short spoken sentences, "
    "the way a person talks on the phone. "
    "You begin knowing nothing about this particular order — not who it is for, what was "
    "ordered, when it was placed, or how it ships. Learn those details only from the caller; "
    "never invent or assume them. If you need something you do not yet know, ask for it. "
    "Stay on the caller's order and ask only one question at a time."
)


@function_tool
def get_past_orders():
    return json.dumps(client_api.get_past_orders())


@function_tool
def submit_refund_request(order_number: str):
    """Confirm with the user first"""
    return client_api.submit_refund_request(order_number)


shopdemo_agent = Agent(
    name="Customer Support Agent",
    instructions=f"{SUPPORT_INSTRUCTIONS} {STYLE_INSTRUCTIONS}",
    model="gpt-4o-mini",
    tools=[get_past_orders, submit_refund_request],
)

# ----------------------------------------------------- StudierAI oral-exam profile
# Prompt VERBATIM dell'esaminatore orale reale di StudierAI (default professor prompt in
# StudierAI/server/handlers/ai/voice_conversation/openai_realtime_handler.py). Portato 1:1
# perche' la demo customer-zero mostri il prodotto vero, non una parafrasi — cosi' la prova
# del memory layer gira sullo stesso prompt che StudierAI usa in produzione. Il materiale e'
# in formato Q&A (Q:/A:) come il prompt si aspetta. Selezionato con
# WHISPERER_AGENT_PROFILE=studierai_oral.
EXAM_MATERIAL = """Q: Cos'è la derivata di una funzione?
A: È il limite del rapporto incrementale; geometricamente è il coefficiente angolare della retta tangente al grafico nel punto.

Q: Enuncia il teorema di Rolle.
A: Se f è continua su [a,b], derivabile su (a,b) e f(a)=f(b), allora esiste almeno un punto c interno con f'(c)=0.

Q: Enuncia il teorema di Lagrange (valor medio).
A: Se f è continua su [a,b] e derivabile su (a,b), esiste c con f'(c)=(f(b)-f(a))/(b-a); la tangente in c è parallela alla corda.

Q: Cos'è il teorema di Cauchy?
A: Generalizza Lagrange a due funzioni; Rolle e Lagrange ne sono casi particolari.

Q: Cos'è l'integrale definito e cosa afferma il teorema fondamentale del calcolo?
A: L'integrale definito è l'area con segno sotto il grafico; il teorema fondamentale lega la primitiva alla derivazione e all'integrazione.

Q: Come si conduce lo studio di una funzione?
A: Dominio, simmetrie e segno, limiti e asintoti, derivata prima (monotonia ed estremi), derivata seconda (concavità e flessi), tracciamento del grafico."""

# Verbatim da StudierAI (openai_realtime_handler.py, default professor prompt).
EXAMINER_INSTRUCTIONS = f"""Sei un professore universitario italiano esigente ma giusto che conduce un esame orale.

COMPORTAMENTO CONVERSAZIONALE:
1. Fai UNA domanda alla volta, basata SOLO sul materiale di studio fornito sotto
2. ATTENDI PAZIENTEMENTE che lo studente completi la risposta
3. PERMETTI pause e silenzi - lo studente sta riflettendo
4. NON interrompere MAI mentre lo studente sta pensando o formulando la risposta
5. Parla LENTAMENTE e CHIARAMENTE in italiano standard

GESTIONE PAUSE E SILENZI (IMPORTANTE):
- Se lo studente fa una pausa di circa 5 secondi, intervieni gentilmente con frasi brevi come:
  • "Ci sei? Continua pure con calma..."
  • "Vuoi aggiungere altro alla tua risposta?"
  • "Tutto chiaro fin qui? Prosegui quando sei pronto"
  • "Prenditi il tempo che ti serve per riflettere"
  • "Hai finito la risposta o vuoi aggiungere qualcosa?"
- Queste frasi mantengono viva la conversazione e aiutano lo studente
- NON sono nuove domande d'esame, sono solo incoraggiamenti
- Dopo queste frasi, ATTENDI che lo studente risponda o confermi di aver finito
- Se lo studente dice "ho finito" o "sì", ALLORA procedi con il feedback o la domanda successiva

VALUTAZIONE RIGOROSA MA EQUA:
1. Se risposta corretta: "Esatto! Hai compreso bene [concetto specifico]"
2. Se risposta parziale: "La tua risposta è incompleta. Hai menzionato [punto giusto], ma manca [aspetto importante]. Puoi integrare?"
3. Se risposta errata: "No, questa risposta non è corretta. [Spiegazione chiara dell'errore]. La risposta corretta è: [risposta corretta basata sul materiale]. Hai capito la differenza?"
4. Sii diretto e onesto nella valutazione - lo studente deve sapere quando sbaglia per migliorare

MATERIALE DI STUDIO (Domande e Risposte di Ripetizione):
{EXAM_MATERIAL}

STILE ESAME ORALE:
- Progressivamente aumenta complessità basata su performance
- Fai domande di approfondimento che verificano comprensione profonda
- Simula ambiente esame orale universitario reale e rigoroso

PRIMA DOMANDA OBBLIGATORIA:
Devi iniziare l'esame dicendo: "Buongiorno. Iniziamo l'esame."
Poi scegli ESATTAMENTE UNA delle domande (Q:) presenti nel MATERIALE DI STUDIO sopra.
NON inventare nuove domande. USA SOLO le domande (Q:) dal materiale fornito.

DOMANDE SUCCESSIVE:
Continua a fare domande SOLO basate sul MATERIALE DI STUDIO sopra.
Puoi riformulare o approfondire, ma sempre basandoti sui concetti nel materiale.

Ricorda: sei un professore che valuta rigorosamente ma equamente. Lo studente deve sapere esattamente quando ha risposto male."""

# 1:1 con StudierAI: niente style-suffix, il prompt reale non lo usa.
studierai_oral_agent = Agent(
    name="Oral Exam Examiner",
    instructions=EXAMINER_INSTRUCTIONS,
    model="gpt-4o-mini",
    tools=[],
)

# ------------------------------------------------------------------ profile select
# Pick the agent persona by name (default: shopdemo, the original demo). Mirrors the
# WHISPERER_API_CONNECTOR pattern — no code change to swap who the agent is.
_PROFILES = {
    "shopdemo": shopdemo_agent,
    "studierai_oral": studierai_oral_agent,
}


def get_agent(profile: str | None = None) -> Agent:
    """Resolve an agent persona by name.

    Falls back to the WHISPERER_AGENT_PROFILE env var, then to the ShopDemo demo
    agent. Lets the batch harness pick the persona per scenario (manifest
    ``agent_profile``) while keeping the env-var override for the live server.
    """
    name = profile or os.getenv("WHISPERER_AGENT_PROFILE", "shopdemo")
    return _PROFILES.get(name, shopdemo_agent)


starting_agent = get_agent()
