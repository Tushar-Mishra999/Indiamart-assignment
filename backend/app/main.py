import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import analytics, appeals, cases, human_review, moderation
from app.storage import init_db

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="IndiaMART AI Image Moderation",
    description="Prototype AI-powered image moderation service for IndiaMART listings, profiles, enquiries, "
                 "reviews, and chats.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(moderation.router)
app.include_router(cases.router)
app.include_router(appeals.router)
app.include_router(human_review.router)
app.include_router(analytics.router)
