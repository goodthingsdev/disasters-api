import { DisasterResponseDTO } from './disaster.dto';

describe('DisasterResponseDTO', () => {
  it('defaults status to active if missing', () => {
    const input = {
      _id: 'id',
      type: 'fire',
      location: { type: 'Point', coordinates: [1, 2] },
      date: '2025-01-01',
      description: 'desc',
      createdAt: '2025-01-01',
      updatedAt: '2025-01-02',
      // status missing
    };
    const dto = new DisasterResponseDTO(input as any);
    expect(dto.status).toBe('active');
  });

  it('uses status if present', () => {
    const input = {
      _id: 'id',
      type: 'fire',
      location: { type: 'Point', coordinates: [1, 2] },
      date: '2025-01-01',
      description: 'desc',
      createdAt: '2025-01-01',
      updatedAt: '2025-01-02',
      status: 'contained',
    };
    const dto = new DisasterResponseDTO(input as any);
    expect(dto.status).toBe('contained');
  });

  // This file is missing an export or test. Add a dummy test to satisfy Jest.
  it('dummy test to satisfy Jest', () => {
    expect(true).toBe(true);
  });
});
