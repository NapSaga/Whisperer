import json

from agents import Agent, function_tool

from whisperer.connectors import load_connector

# The per-client connector behind the agent's tools. Swap it without touching the
# agent by setting WHISPERER_API_CONNECTOR (default: the api_shopdemo fixtures).
client_api = load_connector()

STYLE_INSTRUCTIONS = "Use a conversational tone and write in a chat style without formal formatting or lists and do not use any emojis."

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


customer_support_agent = Agent(
    name="Customer Support Agent",
    instructions=f"{SUPPORT_INSTRUCTIONS} {STYLE_INSTRUCTIONS}",
    model="gpt-4o-mini",
    tools=[get_past_orders, submit_refund_request],
)

starting_agent = customer_support_agent
