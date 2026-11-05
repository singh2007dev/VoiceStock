from pydantic import BaseModel, Field, field_validator


class ProductBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Product name")
    quantity: float = Field(default=0.0, ge=0.0, description="Current stock quantity")
    unit: str = Field(..., min_length=1, max_length=20, description="Unit of measurement (e.g. kg, packet, litre, piece)")
    minimum_stock: float = Field(default=0.0, ge=0.0, description="Minimum stock threshold for alerts")

    @field_validator("name", "unit")
    @classmethod
    def validate_non_empty_string(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Field cannot be empty or only spaces")
        return trimmed


class ProductCreate(ProductBase):
    pass


class ProductUpdateQuantity(BaseModel):
    quantity: float = Field(..., ge=0.0, description="Updated stock quantity (cannot be negative)")


class ProductResponse(ProductBase):
    id: int
    is_low_stock: bool

    class Config:
        from_attributes = True
