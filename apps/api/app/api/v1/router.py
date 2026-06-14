from fastapi import APIRouter

from app.api.v1.endpoints import auth, cart, catalog, health, me, orders, vendor

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router)
api_router.include_router(me.router)
api_router.include_router(catalog.router)
api_router.include_router(cart.router)
api_router.include_router(orders.router)
api_router.include_router(vendor.router)
