-- Add capabilities_json column to store agent capabilities
ALTER TABLE agents ADD COLUMN capabilities_json JSON AFTER labels_json;

