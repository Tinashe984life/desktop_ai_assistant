import asyncio
from playwright.async_api import async_playwright
from random import randint
from colorama import Fore

valid_proxies = [
    '123.30.154.171:7777',
    '162.248.225.3:80',
    '162.248.225.126:80',
    '104.236.195.60:10000',
    '162.248.225.231:80',
    '162.248.225.40:80',
    '162.248.225.225:80',
    '167.71.5.83:3128',
    '162.248.225.34:80',
    '162.248.225.202:80',
    '162.248.225.26:80',
    '162.248.225.2:80',
]

index = randint(0, len(valid_proxies)-1)
proxy = valid_proxies[index]

async def pnp(prompt):
    try:
        async with async_playwright() as p:
            try:
                browser = await p.chromium.launch(headless=False)
            except Exception as e:
                print(Fore.RED, e)
            page = await browser.new_page()
            await page.goto(f"https://www.pnp.co.za/search/{prompt}", timeout=120000)
            await page.wait_for_selector('.product-grid-item')
            containers = await page.query_selector_all('.product-grid-item')
            
            p = []  

            for container in containers:
                name_element = await container.query_selector('.product-grid-item__info-container__name.product-action')  
                price_element = await container.query_selector('.price') 
                image_element = await container.query_selector('.ng-star-inserted')
                product_url_element = await container.query_selector('.product-grid-item__image-container')
                
                if name_element and price_element:
                    name = await name_element.inner_text()
                    price = await price_element.inner_text()
                    image = await image_element.get_attribute('src')
                    url = await product_url_element.get_attribute('href')
                    product_url = "https://www.pnp.co.za"+url
                    
                    product = (name, price.strip("R"), image, product_url)
                    p.append(product)
            await browser.close()
            return p
    except Exception as e:
        print(Fore.WHITE, f"PNP QUERY FAILED  -", Fore.MAGENTA, e)

async def chk(prompt):
    try:
        async with async_playwright() as p:
            c = []
            try:
                browser = await p.chromium.launch(headless=False)
            except Exception as e:
                print(Fore.RED, e)
            page = await browser.new_page()
            await page.goto(f"https://www.checkers.co.za/search/all?q={prompt}", timeout=120000)
            try:
                # Corrected selector for the form
                form = page.locator('form[action="/search"]')
                
                if await form.is_visible():
                    # Corrected selector for the see_all button
                    see_all = form.locator('input[type="submit"]')
                    
                    if await see_all.is_visible():
                        await see_all.click()
                        print("See all clicked")
                        await page.wait_for_selector('.item-product')
                        containers = await page.query_selector_all('.item-product')
                        
                        

                        for container in containers:
                            name_element = await container.query_selector('.item-product__name')  
                            price_element = await container.query_selector('.now') 
                            image_element = await container.query_selector('.lazyloaded')
                            product_url_element = await container.query_selector('.product-listening-click')
                            
                            if name_element and price_element:
                                name = await name_element.inner_text()
                                price = await price_element.inner_text()
                                image = await image_element.get_attribute('src')
                                image = "https://www.checkers.co.za"+image
                                url = await product_url_element.get_attribute('href')
                                product_url = "https://www.checkers.co.za"+url
                                
                                product = (name, price.strip("R"), image, product_url)
                                c.append(product)

                        await browser.close()
                    else:
                        print("See all is not there")
            except Exception as e:
                print(f"uh oh!!! - {e}")
            
            return c
    except Exception as e:
        print(Fore.WHITE, f"CHK QUERY FAILED  -", Fore.MAGENTA, e)

async def srt(prompt):
    try:
        async with async_playwright() as p:
            s = []
            try:
                browser = await p.chromium.launch(headless=False)
            except Exception as e:
                print(Fore.RED, e)
            page = await browser.new_page()
            await page.goto(f"https://www.shoprite.co.za/search/all?q={prompt}", timeout=120000)
            try:
                # Corrected selector for the form
                form = page.locator('form[action="/search"]')
            except Exception as e:
                print(f"uh oh!!! - {e}")

            if await form.is_visible():
                    # Corrected selector for the see_all button
                    see_all = form.locator('input[type="submit"]')
                    
                    if await see_all.is_visible():
                        await see_all.click()
                        print("See all clicked")
                        await page.wait_for_selector('.item-product')
                        containers = await page.query_selector_all('.item-product')
                        
                        

                        for container in containers:
                            name_element = await container.query_selector('.item-product__name')  
                            price_element = await container.query_selector('.now') 
                            image_element = await container.query_selector('.lazyloaded')
                            #print(type(image_element))
                            product_url_element = await container.query_selector('.product-listening-click')
                            
                            if name_element and price_element:
                                name = await name_element.inner_text()
                                price = await price_element.inner_text()
                                try:
                                    #await page.wait_for_selector('. lazyloaded')
                                    image = await image_element.get_attribute('src')
                                except Exception as e:
                                    #print(Fore.RED, f"COULD NOT GET IMAGE: ", Fore.YELLOW, e )
                                    continue
                                image = "https://www.shoprite.co.za"+image
                                url = await product_url_element.get_attribute('href')
                                product_url = "https://www.shoprite.co.za"+url

                                product = (name, price.strip("R"), image, product_url)
                                s.append(product)
                        await browser.close()
                    else:
                        print("See all is not there")
            #await see_all.click()
            
            return s
    except Exception as e:
        print(Fore.WHITE, f"SRT QUERY FAILED  -", Fore.MAGENTA, e)

async def run(prompt):
    pnp_task = run.pnp(prompt)
    chk_task = run.chk(prompt)
    srt_task = run.srt(prompt)

    pnp_result = await pnp_task
    chk_result = await chk_task
    srt_result = await srt_task

    return [pnp_result, chk_result, srt_result]