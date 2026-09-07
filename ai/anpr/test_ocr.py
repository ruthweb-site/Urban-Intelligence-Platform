import easyocr

reader = easyocr.Reader(['en'])
result = reader.readtext('test_frame62_plate0.jpg')

print(result)