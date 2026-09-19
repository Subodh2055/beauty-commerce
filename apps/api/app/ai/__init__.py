"""AI features (V2). Planned sub-packages per the project vault:

chatbot/ · recommendations/ · semantic_search/ · embeddings/ · rag/
product_advisor/ · similar_products/

Rule: AI code must go through the same services/authorization as the rest of
the app. It never talks to the database with elevated privileges.
"""
