ALTER TABLE cards ADD COLUMN art_zoom_percent INTEGER NOT NULL DEFAULT 100 CHECK (art_zoom_percent BETWEEN 50 AND 200);
ALTER TABLE cards ADD COLUMN art_offset_x_percent INTEGER NOT NULL DEFAULT 0 CHECK (art_offset_x_percent BETWEEN -50 AND 50);
ALTER TABLE cards ADD COLUMN art_offset_y_percent INTEGER NOT NULL DEFAULT 0 CHECK (art_offset_y_percent BETWEEN -50 AND 50);

UPDATE cards SET
  art_zoom_percent = CASE WHEN json_type(details, '$[0].artZoomPercent') = 'integer' AND json_extract(details, '$[0].artZoomPercent') BETWEEN 50 AND 200 THEN json_extract(details, '$[0].artZoomPercent') ELSE 100 END,
  art_offset_x_percent = CASE WHEN json_type(details, '$[0].artOffsetXPercent') = 'integer' AND json_extract(details, '$[0].artOffsetXPercent') BETWEEN -50 AND 50 THEN json_extract(details, '$[0].artOffsetXPercent') ELSE 0 END,
  art_offset_y_percent = CASE WHEN json_type(details, '$[0].artOffsetYPercent') = 'integer' AND json_extract(details, '$[0].artOffsetYPercent') BETWEEN -50 AND 50 THEN json_extract(details, '$[0].artOffsetYPercent') ELSE 0 END;
