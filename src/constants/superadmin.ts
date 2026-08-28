export const SUPERADMIN_UID = "m2CRzyI1D7VpuIGDDu1t8CnoB0m2";
export const SUPERADMIN_EMAIL = "danielkansberg@gmail.com";

export function isSuperadminUid(uid: string | null | undefined): boolean {
  return uid === SUPERADMIN_UID;
}
