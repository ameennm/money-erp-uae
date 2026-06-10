export const ROLES = {
  ADMIN: 'admin',
  EMPLOYEE: 'employee',
  COLLECTOR: 'collector',
};

export const isAdmin = (role) => role === ROLES.ADMIN;

export const isBusinessAdmin = (role) => [ROLES.ADMIN, ROLES.EMPLOYEE].includes(role);

export const canOperate = (role) => [ROLES.ADMIN, ROLES.EMPLOYEE, ROLES.COLLECTOR].includes(role);
