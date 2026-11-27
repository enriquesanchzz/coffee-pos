"use server";

import { revalidatePath } from "next/cache";
import type { PetSpecies } from "@prisma/client";
import { safeAction } from "@/lib/safe-action";
import { prisma } from "@/lib/prisma";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { assertSessionEmployee } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";
import { normalizeImageUrl } from "@/lib/validation";
import { normalizeAllergenTags } from "@/lib/allergens";
import { PET_ORDER, toCustomerPet, type CustomerPet } from "@/lib/customers";
import { zonedDateKey } from "@/lib/time";

// Mascotas de un cliente (CRM-01/02). Las da de alta quien atiende en caja
// (mismo permiso que crear un cliente desde el POS) o el admin desde el
// perfil del cliente. Cada acción regresa la lista actualizada para que la
// pantalla la muestre sin recargar.

const SPECIES: PetSpecies[] = ["PERRO", "GATO", "OTRO"];
const MAX_PETS_PER_CUSTOMER = 20;

export type SavePetInput = {
  employeeId: string;
  customerId: string;
  petId?: string; // sin id = mascota nueva
  name: string;
  species: PetSpecies;
  breed?: string;
  weightKg?: number | null;
  birthDate?: string | null; // "YYYY-MM-DD"
  photoUrl?: string;
  allergies: string[];
  notes?: string;
};

function optionalText(value: string | undefined, label: string, max: number) {
  const text = value?.trim() ?? "";
  if (text.length > max) throw new Error(`${label}: máximo ${max} caracteres.`);
  return text || null;
}

function validBirthDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("La fecha de cumpleaños no es válida.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("La fecha de cumpleaños no es válida.");
  }
  if (value > zonedDateKey(new Date())) throw new Error("La fecha de cumpleaños no puede ser futura.");
  if (value < "1980-01-01") throw new Error("Revisa el año del cumpleaños.");
  return date;
}

function validWeight(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value <= 0 || value > 200) {
    throw new Error("El peso debe ser mayor a 0 y de máximo 200 kg.");
  }
  return Math.round(value * 100) / 100;
}

async function petsOf(customerId: string): Promise<CustomerPet[]> {
  const pets = await prisma.pet.findMany({ where: { customerId }, orderBy: PET_ORDER });
  return pets.map(toCustomerPet);
}

function revalidateCustomer(customerId: string) {
  revalidatePath("/pos");
  revalidatePath(`/clientes/${customerId}`);
  revalidatePath("/clientes/cumpleanos");
}

export const savePet = safeAction(async function savePet(input: SavePetInput): Promise<CustomerPet[]> {
  await assertSessionEmployee(input.employeeId);
  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "CLIENTE_CONFIGURAR");

  const name = input.name?.trim() ?? "";
  if (!name) throw new Error("El nombre de la mascota es obligatorio.");
  if (name.length > 60) throw new Error("El nombre de la mascota: máximo 60 caracteres.");
  if (!SPECIES.includes(input.species)) throw new Error("Elige si es perro, gato u otro.");

  const data = {
    name,
    species: input.species,
    breed: optionalText(input.breed, "La raza", 60),
    weightKg: validWeight(input.weightKg),
    birthDate: validBirthDate(input.birthDate),
    photoUrl: normalizeImageUrl(input.photoUrl),
    allergies: normalizeAllergenTags(input.allergies),
    notes: optionalText(input.notes, "Las notas", 500),
  };

  const customer = await prisma.customer.findUnique({ where: { id: input.customerId }, select: { id: true } });
  if (!customer) throw new Error("Ese cliente ya no existe.");

  // birthDateSetAt: ver Pet en el schema — una fecha recién capturada o
  // cambiada no da cupón en el cumpleaños que ya está corriendo.
  if (input.petId) {
    // Solo una mascota de ESTE cliente.
    const current = await prisma.pet.findFirst({
      where: { id: input.petId, customerId: input.customerId },
      select: { birthDate: true },
    });
    if (!current) throw new Error("Esa mascota ya no existe.");
    const birthDateChanged = (current.birthDate?.getTime() ?? null) !== (data.birthDate?.getTime() ?? null);
    await prisma.pet.update({
      where: { id: input.petId },
      // Cualquier cambio (también borrarla) se fecha: null queda solo para
      // fechas anteriores a la migración, que se consideran de confianza.
      data: { ...data, ...(birthDateChanged ? { birthDateSetAt: new Date() } : {}) },
    });
  } else {
    const existing = await prisma.pet.count({ where: { customerId: input.customerId } });
    if (existing >= MAX_PETS_PER_CUSTOMER) throw new Error(`Máximo ${MAX_PETS_PER_CUSTOMER} mascotas por cliente.`);
    await prisma.pet.create({
      data: { ...data, customerId: input.customerId, birthDateSetAt: new Date() },
    });
  }

  revalidateCustomer(input.customerId);
  return petsOf(input.customerId);
});

// Borra la mascota. Los cupones de cumpleaños que ya se le dieron al dueño
// se conservan.
export const deletePet = safeAction(async function deletePet(input: {
  employeeId: string;
  customerId: string;
  petId: string;
}): Promise<CustomerPet[]> {
  await assertSessionEmployee(input.employeeId);
  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "CLIENTE_CONFIGURAR");

  await prisma.pet.deleteMany({ where: { id: input.petId, customerId: input.customerId } });
  revalidateCustomer(input.customerId);
  return petsOf(input.customerId);
});
