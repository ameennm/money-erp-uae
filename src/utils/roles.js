export const ROLES = {
  ADMIN: 'admin',
  EMPLOYEE: 'employee',
  COLLECTOR: 'collector',
};

export const isAdmin = (role) => role === ROLES.ADMIN;

export const isBusinessAdmin = (role) => role === ROLES.ADMIN;

export const canOperate = (role) => [ROLES.ADMIN, ROLES.COLLECTOR].includes(role);
